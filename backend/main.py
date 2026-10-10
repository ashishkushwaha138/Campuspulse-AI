"""FastAPI API for the CampusPulse AI student success dashboard."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from typing import Any, Literal
from urllib.parse import urlparse
from uuid import uuid4

import numpy as np
import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from src.data_loader import generate_demo_sources, integrate_sources, read_uploaded_tables
from src.preprocessing import current_cohort, prepare_integrated_data, add_score_components
from src.risk_analysis import PLAYBOOKS, assign_segments, recommendations
from src.scoring import score_students

ROOT = Path(__file__).resolve().parents[1]
ACTION_FILE = ROOT / "data" / "interventions.json"
MAX_UPLOAD_BYTES = 8 * 1024 * 1024
MAX_UPLOAD_FILES = 12
LOCK = RLock()
SOURCES = generate_demo_sources()
ALL_STUDENTS: pd.DataFrame
CURRENT: pd.DataFrame
SEGMENT_CENTERS: pd.DataFrame
LAST_ACTIONS: list[dict[str, Any]] = []
SYNTHETIC_MODE = True

app = FastAPI(title="CampusPulse AI", version="2.0.0", description="Student success analytics and intervention API")

allowed_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
for _origin in os.getenv("FRONTEND_ORIGIN", "").split(","):
    _origin = _origin.strip().rstrip("/")
    if _origin:
        allowed_origins.append(_origin)
        _parsed = urlparse(_origin)
        _bare = f"{_parsed.scheme}://{_parsed.netloc}"
        if _bare and _bare != _origin:
            allowed_origins.append(_bare)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class InterventionRequest(BaseModel):
    student_id: str = Field(min_length=1, max_length=80)
    action: str = Field(min_length=3, max_length=240)
    intervention_type: str = Field(default="General Support", max_length=80)
    reason: str = Field(default="", max_length=500)
    assigned_to: str = Field(default="Campus Administrator", max_length=120)
    due_date: str = Field(default="", max_length=10)
    status: Literal["Planned", "In Progress", "Completed", "Cancelled"] = "Planned"
    notes: str = Field(default="", max_length=2000)
    admin_name: str = Field(default="Campus Administrator", max_length=120)


class InterventionUpdate(BaseModel):
    status: Literal["Planned", "In Progress", "Completed", "Cancelled"] | None = None
    notes: str | None = Field(default=None, max_length=2000)
    assigned_to: str | None = Field(default=None, max_length=120)
    due_date: str | None = Field(default=None, max_length=10)


class ChatRequest(BaseModel):
    question: str = Field(min_length=2, max_length=600)
    admin_name: str = "Campus Administrator"


class SimulateRequest(BaseModel):
    student_id: str = Field(min_length=1, max_length=80)
    attendance_pct: float | None = Field(default=None, ge=0, le=100)
    assignment_completion: float | None = Field(default=None, ge=0, le=100)
    cgpa: float | None = Field(default=None, ge=0, le=10)
    coding_score: float | None = Field(default=None, ge=0, le=100)
    aptitude_score: float | None = Field(default=None, ge=0, le=100)
    technical_score: float | None = Field(default=None, ge=0, le=100)
    soft_skill_score: float | None = Field(default=None, ge=0, le=100)
    login_frequency: float | None = Field(default=None, ge=0)


def _round(value: Any, digits: int = 1) -> float:
    return round(float(value), digits) if pd.notna(value) else 0.0


def _json_records(frame: pd.DataFrame) -> list[dict[str, Any]]:
    clean = frame.astype(object).replace({float("inf"): None, float("-inf"): None}).where(pd.notna(frame), None)
    return clean.to_dict(orient="records")


def _student_records(frame: pd.DataFrame) -> list[dict[str, Any]]:
    fields = [
        "student_id", "name", "department", "year", "semester", "cgpa", "internal_marks", "exam_marks", "backlogs",
        "attendance_pct", "login_frequency", "assignment_completion", "events", "certifications", "hackathons",
        "aptitude_score", "coding_score", "mock_interviews", "technical_score", "soft_skill_score", "satisfaction_score",
        "academic_component", "attendance_component", "lms_component", "placement_component", "skills_component",
        "engagement_component", "success_score", "rule_risk", "risk_reasons", "placement_gap", "placement_ready",
        "segment", "recommendations", "data_coverage", "missing_indicators", "invalid_value_count",
        "academic_missing", "attendance_missing", "lms_missing", "skills_missing", "placement_missing", "engagement_missing",
        "backlogs_missing",
    ]
    output = []
    for row in frame.to_dict(orient="records"):
        item = {key: row.get(key) for key in fields if key in row}
        item["risk"] = item.pop("rule_risk", "Low")
        item["score_components"] = {
            "Academic": _round(row.get("academic_component", 0)),
            "Attendance": _round(row.get("attendance_component", 0)),
            "LMS activity": _round(row.get("lms_component", 0)),
            "Placement": _round(row.get("placement_component", 0)),
            "Skills": _round(row.get("skills_component", 0)),
            "Engagement": _round(row.get("engagement_component", 0)),
        }
        output.append(item)
    return output


def _build_views(sources: dict[str, pd.DataFrame], synthetic: bool = False) -> None:
    global SOURCES, ALL_STUDENTS, CURRENT, SEGMENT_CENTERS, SYNTHETIC_MODE
    integrated = integrate_sources(sources)
    if integrated.empty:
        raise ValueError("No student records were found in the uploaded files.")
    all_students = score_students(prepare_integrated_data(integrated))
    current = current_cohort(all_students)
    current, centers = assign_segments(current)
    current["recommendations"] = current.apply(recommendations, axis=1)
    with LOCK:
        SOURCES = sources
        SYNTHETIC_MODE = synthetic
        ALL_STUDENTS = all_students
        CURRENT = current
        SEGMENT_CENTERS = centers


def _load_actions() -> None:
    global LAST_ACTIONS
    try:
        loaded = json.loads(ACTION_FILE.read_text(encoding="utf-8")) if ACTION_FILE.exists() else []
        LAST_ACTIONS = loaded[:500] if isinstance(loaded, list) else []
    except (OSError, json.JSONDecodeError):
        LAST_ACTIONS = []


def _save_actions() -> None:
    try:
        ACTION_FILE.parent.mkdir(parents=True, exist_ok=True)
        ACTION_FILE.write_text(json.dumps(LAST_ACTIONS[:500], indent=2), encoding="utf-8")
    except OSError:
        pass


_build_views(SOURCES, synthetic=True)
_load_actions()


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok", "service": "CampusPulse AI", "version": "2.0.0",
        "students": int(len(CURRENT)), "data_mode": "synthetic demo" if SYNTHETIC_MODE else "uploaded CSV",
    }


@app.get("/api/overview")
def overview() -> dict[str, Any]:
    data = CURRENT
    latest_semester = int(data["semester"].max())
    trend_rows = ALL_STUDENTS.groupby("semester", as_index=False)["success_score"].mean()
    trend = [{"semester": f"Sem {int(r.semester)}", "score": _round(r.success_score)} for r in trend_rows.itertuples()]
    risk_counts = data["rule_risk"].value_counts()
    distribution = [{"name": n, "value": int(risk_counts.get(n, 0))} for n in ("Low", "Medium", "High")]
    departments = data.groupby("department", as_index=False).agg(
        students=("student_id", "nunique"), avg_score=("success_score", "mean"),
        high_risk=("rule_risk", lambda s: int(s.eq("High").sum()))
    ).sort_values("avg_score")
    coverage = _round(data["data_coverage"].mean())
    missing_groups = [
        label for col, label in (
            ("academic_missing", "Academic"), ("attendance_missing", "Attendance"),
            ("lms_missing", "LMS"), ("skills_missing", "Skills"),
            ("placement_missing", "Placement"), ("engagement_missing", "Engagement"),
        ) if col in data.columns and data[col].any()
    ]
    return {
        "kpis": {
            "students": int(data["student_id"].nunique()),
            "avg_score": _round(data["success_score"].mean()),
            "need_attention": int(data["rule_risk"].isin(["High", "Medium"]).sum()),
            "placement_ready": int(data["placement_ready"].sum()),
            "placement_gap": int(data["placement_gap"].sum()),
            "high_risk": int(data["rule_risk"].eq("High").sum()),
        },
        "semester": latest_semester,
        "cohort_mode": "synthetic demo" if SYNTHETIC_MODE else "uploaded cohort",
        "data_quality": {
            "coverage": coverage,
            "missing_indicators": missing_groups,
            "partial_records": int(data["data_coverage"].lt(100).sum()),
            "invalid_values": int(data.get("invalid_value_count", pd.Series(0, index=data.index)).sum()),
        },
        "trends": trend,
        "risk_distribution": distribution,
        "departments": [{**row, "avg_score": _round(row["avg_score"])} for row in _json_records(departments)],
        "last_actions": LAST_ACTIONS[:8],
        "priority_insight": _priority_insight(data),
    }


def _priority_insight(data: pd.DataFrame) -> str:
    watch = data.loc[data["rule_risk"].isin(["High", "Medium"])]
    if watch.empty:
        return "No students currently meet the cohort's watchlist thresholds. Keep monitoring attendance and assignment completion."
    gap_count = int(data["placement_gap"].sum())
    if gap_count:
        return f"{gap_count} students have CGPA above 7.5 but below-median coding or aptitude. A focused placement bridge can address this gap."
    measured_attendance = watch.loc[~watch["attendance_missing"]]
    if measured_attendance.empty:
        return "Attendance data is not available in the current cohort. Import attendance records to enable attendance-based watchlists."
    attendance_low = int(measured_attendance["attendance_pct"].lt(75).sum())
    return f"{attendance_low} of {len(measured_attendance)} watchlist students are below 75% attendance. Begin with advisor outreach and barrier checks."


@app.get("/api/students")
def students(
    q: str = "", department: str = "All departments", risk: str = "All risk levels",
    segment: str = "All segments", placement_gap: bool = False, limit: int = 1000,
) -> dict[str, Any]:
    data = CURRENT.copy()
    if q.strip():
        term = q.casefold().strip()
        data = data.loc[
            data["name"].astype(str).str.casefold().str.contains(term, na=False, regex=False) |
            data["student_id"].astype(str).str.casefold().str.contains(term, na=False, regex=False)
        ]
    if department != "All departments":
        data = data.loc[data["department"].eq(department)]
    if risk != "All risk levels":
        data = data.loc[data["rule_risk"].eq(risk)]
    if segment != "All segments":
        data = data.loc[data["segment"].eq(segment)]
    if placement_gap:
        data = data.loc[data["placement_gap"]]
    risk_order = {"High": 0, "Medium": 1, "Low": 2}
    data = data.copy()
    data["_risk_order"] = data["rule_risk"].map(risk_order).fillna(3)
    data = data.sort_values(["_risk_order", "success_score"]).drop(columns="_risk_order").head(max(1, min(limit, 2000)))
    return {
        "students": _student_records(data),
        "total": int(len(data)),
        "departments": sorted(CURRENT["department"].dropna().unique().tolist()),
    }


@app.get("/api/students/{student_id}")
def student_detail(student_id: str) -> dict[str, Any]:
    matches = CURRENT.loc[CURRENT["student_id"].eq(student_id)]
    if matches.empty:
        raise HTTPException(status_code=404, detail="Student not found")
    current = matches.iloc[0]
    history = ALL_STUDENTS.loc[ALL_STUDENTS["student_id"].eq(student_id)].sort_values("semester")
    result = _student_records(matches)[0]
    result["history"] = [
        {"semester": f"Sem {int(r.semester)}", "score": _round(r.success_score), "attendance": _round(r.attendance_pct),
         "academic": _round(r.academic_component), "lms": _round(r.lms_component), "placement": _round(r.placement_component)}
        for r in history.itertuples()
    ]
    result["recommendations"] = recommendations(current)
    result["interventions"] = [a for a in LAST_ACTIONS if a.get("student_id") == student_id]
    return result


@app.get("/api/segments")
def segments() -> dict[str, Any]:
    output = []
    for name in ("High Performers", "Silent Strugglers", "Placement Gap", "Disengaged"):
        group = CURRENT.loc[CURRENT["segment"].eq(name)]
        output.append({
            "name": name, "size": int(len(group)),
            "avg_score": _round(group["success_score"].mean()),
            "avg_attendance": _round(group["attendance_pct"].mean()),
            "avg_cgpa": _round(group["cgpa"].mean(), 2),
            "avg_placement": _round(group["placement_component"].mean()),
            "playbook": PLAYBOOKS[name],
            "students": _student_records(group.sort_values("success_score").head(5)),
        })
    return {"segments": output}


@app.get("/api/placement")
def placement() -> dict[str, Any]:
    data = CURRENT.copy()
    assessed = data.loc[~data["placement_missing"]]
    return {
        "medians": {
            "aptitude": _round(assessed["aptitude_score"].median()) if len(assessed) else None,
            "coding": _round(assessed["coding_score"].median()) if len(assessed) else None,
        },
        "assessed": int(len(assessed)),
        "ready": int(data["placement_ready"].sum()),
        "gap": int(data["placement_gap"].sum()),
        "students": _student_records(assessed.sort_values("placement_component").tail(100)),
        "bands": [
            {"name": "Strong", "value": int(assessed["placement_component"].ge(75).sum())},
            {"name": "Building", "value": int(assessed["placement_component"].between(55, 74.99).sum())},
            {"name": "Needs support", "value": int(assessed["placement_component"].lt(55).sum())},
        ],
    }


@app.get("/api/trends")
def trends() -> dict[str, Any]:
    """Per-semester cohort-level trend data for the trends analytics page."""
    data = ALL_STUDENTS.copy()
    semesters = sorted(data["semester"].unique())
    result = []
    for sem in semesters:
        sem_data = data.loc[data["semester"].eq(sem)]
        att_data = sem_data.loc[~sem_data["attendance_missing"]] if "attendance_missing" in sem_data.columns else sem_data
        lms_data = sem_data.loc[~sem_data["lms_missing"]] if "lms_missing" in sem_data.columns else sem_data
        place_data = sem_data.loc[~sem_data["placement_missing"]] if "placement_missing" in sem_data.columns else sem_data
        result.append({
            "semester": f"Sem {int(sem)}",
            "sem_num": int(sem),
            "students": int(len(sem_data)),
            "avg_score": _round(sem_data["success_score"].mean()),
            "avg_attendance": _round(att_data["attendance_pct"].mean()) if len(att_data) else None,
            "avg_academic": _round(sem_data["academic_component"].mean()),
            "avg_lms": _round(lms_data["lms_component"].mean()) if len(lms_data) else None,
            "avg_placement": _round(place_data["placement_component"].mean()) if len(place_data) else None,
            "high_risk_count": int(sem_data["rule_risk"].eq("High").sum()),
            "medium_risk_count": int(sem_data["rule_risk"].eq("Medium").sum()),
        })
    dept_trends = []
    for dept in sorted(data["department"].dropna().unique()):
        dept_data = data.loc[data["department"].eq(dept)]
        sem_scores = dept_data.groupby("semester", as_index=False)["success_score"].mean()
        dept_trends.append({
            "department": dept,
            "trend": [{"semester": f"Sem {int(r.semester)}", "score": _round(r.success_score)} for r in sem_scores.itertuples()],
        })
    return {
        "cohort": result,
        "departments": dept_trends,
        "synthetic": SYNTHETIC_MODE,
    }


@app.get("/api/insights")
def insights() -> dict[str, Any]:
    data = CURRENT
    watch = data.loc[data["rule_risk"].isin(["High", "Medium"])]
    attendance_watch = watch.loc[~watch["attendance_missing"]] if "attendance_missing" in watch.columns else watch
    consecutive = 0
    eligible_attendance_history = 0
    for sid in attendance_watch["student_id"].unique():
        hist = ALL_STUDENTS.loc[
            ALL_STUDENTS["student_id"].eq(sid) & ~ALL_STUDENTS["attendance_missing"]
        ].sort_values("semester")
        if len(hist) < 3:
            continue
        latest_three = hist.tail(3)
        semesters = latest_three["semester"].to_numpy(dtype=int)
        vals = latest_three["attendance_pct"].to_numpy(dtype=float)
        if np.array_equal(np.diff(semesters), np.ones(2, dtype=int)):
            eligible_attendance_history += 1
            if vals[-1] < vals[-2] < vals[-3]:
                consecutive += 1
    asgn_data = data.loc[~data["lms_missing"]] if "lms_missing" in data.columns else data
    eng_data = data.loc[~data["engagement_missing"]] if "engagement_missing" in data.columns else data
    insights_list = [
        {
            "title": "Attendance trend on the watchlist",
            "value": f"{(consecutive / max(eligible_attendance_history, 1)):.0%}" if eligible_attendance_history else "No data",
            "detail": f"{consecutive} of {eligible_attendance_history} watchlist students with three consecutive recorded semesters had attendance decline across two transitions.",
            "action": "Ask advisors to check for timetable, commute, health, or access barriers.",
        },
        {
            "title": "Strong academics, placement gap",
            "value": str(int(data["placement_gap"].sum())),
            "detail": "Students have CGPA above 7.5 but coding or aptitude below the cohort median.",
            "action": "Create a short coding and aptitude bridge with a four-week mock-test review.",
        },
        {
            "title": "Assignment completion opportunity",
            "value": f"{_round(asgn_data['assignment_completion'].mean())}%" if len(asgn_data) else "No data",
            "detail": f"Average assignment completion from {len(asgn_data)} students with LMS records.",
            "action": "Prioritize LMS nudges and faculty check-ins for students below 60%.",
        },
        {
            "title": "Students needing academic support",
            "value": str(int((~data["academic_missing"] & (data["academic_component"] < 55)).sum())),
            "detail": "Students with academic data have an academic component below 55/100.",
            "action": "Offer subject-level remedial sessions and a fortnightly progress review.",
        },
        {
            "title": "Engagement and belonging",
            "value": f"{_round(eng_data['engagement_component'].mean())}/100" if len(eng_data) else "No data",
            "detail": f"Engagement average from {len(eng_data)} students with events, certification, or hackathon data.",
            "action": "Connect low-engagement students with clubs, peer groups, or project teams.",
        },
    ]
    return {"insights": insights_list, "generated_from": "synthetic demo cohort" if SYNTHETIC_MODE else "uploaded cohort data"}


@app.post("/api/chat")
def chat(payload: ChatRequest) -> dict[str, Any]:
    question = payload.question.strip().casefold()
    data = CURRENT
    total = max(len(data), 1)
    high = data.loc[data["rule_risk"].eq("High")]
    watch = data.loc[data["rule_risk"].isin(["High", "Medium"])]
    gap = data.loc[data["placement_gap"]]
    related: list[dict[str, Any]] = []

    match = None
    for _, row in data.iterrows():
        name = str(row["name"]).casefold()
        sid = str(row["student_id"]).casefold()
        if sid in question or (len(name) > 5 and name in question):
            match = row
            break

    if match is not None:
        sid = str(match["student_id"])
        history = ALL_STUDENTS.loc[ALL_STUDENTS["student_id"].eq(sid)].sort_values("semester")
        latest = history.iloc[-1]
        prior = history.iloc[-2] if len(history) > 1 else None
        reasons = "; ".join(match["risk_reasons"])
        attendance_text = f"{float(match['attendance_pct']):.0f}%" if not match.get("attendance_missing", False) else "not recorded"
        cgpa_text = f"{float(match['cgpa']):.1f}" if not match.get("cgpa_missing", False) else "not recorded"
        placement_text = f"{float(match['placement_component']):.0f}/100" if not match.get("placement_missing", False) else "not assessed"
        score_change = (
            f"Success score moved from {int(prior['success_score'])} to {int(latest['success_score'])} across the last two terms."
            if prior is not None else "No earlier semester record is available."
        )
        answer = (
            f"{match['name']} has a Success Score of {int(match['success_score'])}/100 in the {match['rule_risk']} risk band. "
            f"Attendance: {attendance_text}, CGPA: {cgpa_text}, placement readiness: {placement_text}. "
            f"Key signals: {reasons}. {score_change} "
            f"Suggested next step: {recommendations(match)[0]}"
        )
        related = [{"student_id": sid, "name": str(match["name"]), "risk": str(match["rule_risk"]), "score": int(match["success_score"])}]

    elif any(w in question for w in ("intervention", "action", "assigned", "pending", "overdue")):
        pending = [a for a in LAST_ACTIONS if a.get("status") in ("Planned", "In Progress")]
        overdue_count = sum(1 for a in pending if a.get("due_date") and a["due_date"] < datetime.now(tz=timezone.utc).isoformat()[:10])
        answer = (
            f"There are {len(LAST_ACTIONS)} interventions recorded in total. "
            f"{len(pending)} are pending (Planned or In Progress), and {overdue_count} are past their due date. "
            "Open the Interventions page to review and update them."
        )
    elif any(w in question for w in ("placement", "coding", "aptitude", "job", "ready")):
        assessed = data.loc[~data["placement_missing"]]
        coding_med = assessed["coding_score"].median() if len(assessed) else None
        apt_med = assessed["aptitude_score"].median() if len(assessed) else None
        median_note = f"(coding median {coding_med:.0f}, aptitude median {apt_med:.0f}). " if coding_med is not None and apt_med is not None else "No placement assessments available. "
        answer = (
            f"{int(data['placement_ready'].sum())} of {len(data)} students meet the placement-ready rule. "
            f"{len(gap)} students have CGPA above 7.5 but below-cohort-median coding or aptitude "
            f"{median_note}"
            "A four-week coding and aptitude bridge with mock tests is a practical next step."
        )
        related = _student_records(gap.sort_values("placement_component").head(5))
    elif any(w in question for w in ("attendance", "absent", "presence")):
        low_att = data.loc[~data["attendance_missing"] & data["attendance_pct"].lt(65)]
        observed_attendance = data.loc[~data["attendance_missing"], "attendance_pct"]
        answer = (
            f"Average recorded attendance is {observed_attendance.mean():.1f}% across {len(observed_attendance)} students. "
            if len(observed_attendance) else "Attendance has not been recorded for this cohort. "
        ) + (
            f"{len(low_att)} students are below 65%. "
            "Start with supportive advisor check-ins to understand schedule, commute, wellbeing, or access barriers."
        )
        related = _student_records(low_att.sort_values("attendance_pct").head(5))
    elif any(w in question for w in ("segment", "cluster", "silent struggler", "disengaged", "high performer")):
        requested = next((n for n in ("High Performers", "Silent Strugglers", "Placement Gap", "Disengaged") if n.casefold() in question), None)
        if requested:
            group = data.loc[data["segment"].eq(requested)]
            answer = (
                f"The {requested} segment contains {len(group)} students ({len(group)/total:.0%} of this cohort), "
                f"with an average Success Score of {group['success_score'].mean():.0f}. "
                f"Playbook: {'; '.join(PLAYBOOKS[requested])}."
            )
            related = _student_records(group.sort_values("success_score").head(5))
        else:
            counts = data["segment"].value_counts()
            answer = "Current segment sizes: " + ", ".join(
                f"{n}: {int(counts.get(n, 0))}" for n in ("High Performers", "Silent Strugglers", "Placement Gap", "Disengaged")
            ) + ". Open Student Segments to review targeted intervention playbooks."
    elif any(w in question for w in ("score", "formula", "weight", "success")):
        answer = (
            f"The cohort average Success Score is {data['success_score'].mean():.0f}/100. "
            "Formula: 35% Academic + 20% Attendance + 15% LMS + 15% Skills + 15% Placement readiness. "
            "Each student profile shows the six component values and the main risk drivers."
        )
    elif any(w in question for w in ("risk", "at-risk", "watch", "attention", "who needs", "department", "dept")):
        if any(w in question for w in ("department", "dept", "which dept", "lowest")):
            dept_avg = data.groupby("department")["placement_component"].mean().sort_values()
            worst = dept_avg.index[0] if len(dept_avg) else "N/A"
            answer = (
                f"The department with the lowest average placement readiness is {worst} "
                f"({dept_avg.iloc[0]:.0f}/100). "
                f"Top 3 departments needing placement support: {', '.join(dept_avg.index[:3].tolist())}."
            )
        else:
            priority = watch.sort_values(["rule_risk", "success_score"]).head(5)
            answer = (
                f"{len(high)} students are in the High risk band, {len(watch)-len(high)} are in Medium. "
                f"{len(watch)} of {len(data)} students may benefit from review. "
                "Start with High risk students, then check attendance and backlog context."
            )
            related = _student_records(priority)
    else:
        answer = (
            f"This cohort tracks {len(data)} students with an average Success Score of {data['success_score'].mean():.0f}/100. "
            f"{len(watch)} are in the High or Medium review bands, {int(data['placement_ready'].sum())} are placement-ready, "
            f"and {len(gap)} have a placement gap. "
            "Try asking about a student by name, attendance, placement gaps, risk flags, segments, interventions, or the score formula."
        )
    return {"answer": answer, "related_students": related, "generated_from": "current cohort analytics", "synthetic_data": SYNTHETIC_MODE}


@app.get("/api/actions")
def actions() -> dict[str, Any]:
    return {"actions": LAST_ACTIONS[:100]}


@app.post("/api/interventions")
def create_intervention(payload: InterventionRequest) -> dict[str, Any]:
    student = CURRENT.loc[CURRENT["student_id"].eq(payload.student_id)]
    if student.empty:
        raise HTTPException(status_code=404, detail="Student not found")
    item = {
        "id": f"act-{uuid4().hex}",
        "student_id": payload.student_id,
        "student_name": str(student.iloc[0]["name"]),
        "department": str(student.iloc[0]["department"]),
        "action": payload.action,
        "intervention_type": payload.intervention_type,
        "reason": payload.reason,
        "assigned_to": payload.assigned_to,
        "due_date": payload.due_date,
        "status": payload.status,
        "notes": payload.notes,
        "admin_name": payload.admin_name,
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        "updated_at": datetime.now(tz=timezone.utc).isoformat(),
    }
    with LOCK:
        LAST_ACTIONS.insert(0, item)
        _save_actions()
    return {"action": item, "message": "Intervention created successfully."}


@app.patch("/api/interventions/{intervention_id}")
def update_intervention(intervention_id: str, payload: InterventionUpdate) -> dict[str, Any]:
    with LOCK:
        for item in LAST_ACTIONS:
            if item.get("id") == intervention_id:
                if payload.status is not None:
                    item["status"] = payload.status
                if payload.notes is not None:
                    item["notes"] = payload.notes
                if payload.assigned_to is not None:
                    item["assigned_to"] = payload.assigned_to
                if payload.due_date is not None:
                    item["due_date"] = payload.due_date
                item["updated_at"] = datetime.now(tz=timezone.utc).isoformat()
                _save_actions()
                return {"action": item, "message": "Intervention updated."}
    raise HTTPException(status_code=404, detail="Intervention not found")


@app.post("/api/simulate")
def simulate(payload: SimulateRequest) -> dict[str, Any]:
    """Return the mathematical effect of adjusted indicators on a student's Success Score."""
    matches = CURRENT.loc[CURRENT["student_id"].eq(payload.student_id)]
    if matches.empty:
        raise HTTPException(status_code=404, detail="Student not found")
    row = matches.iloc[0].to_dict()
    baseline_score = int(row["success_score"])
    baseline_components = {
        "Academic": _round(row.get("academic_component", 0)),
        "Attendance": _round(row.get("attendance_component", 0)),
        "LMS activity": _round(row.get("lms_component", 0)),
        "Placement": _round(row.get("placement_component", 0)),
        "Skills": _round(row.get("skills_component", 0)),
    }
    overrides = {k: v for k, v in {
        "attendance_pct": payload.attendance_pct,
        "assignment_completion": payload.assignment_completion,
        "cgpa": payload.cgpa,
        "coding_score": payload.coding_score,
        "aptitude_score": payload.aptitude_score,
        "technical_score": payload.technical_score,
        "soft_skill_score": payload.soft_skill_score,
        "login_frequency": payload.login_frequency,
    }.items() if v is not None}
    if not overrides:
        raise HTTPException(status_code=400, detail="Provide at least one indicator to simulate.")
    sim_row = pd.DataFrame([{**row, **overrides}])
    sim_scored = add_score_components(sim_row).iloc[0]
    sim_score = int(round(
        sim_scored["academic_component"] * 0.35
        + sim_scored["attendance_component"] * 0.20
        + sim_scored["lms_component"] * 0.15
        + sim_scored["skills_component"] * 0.15
        + sim_scored["placement_component"] * 0.15
    ))
    sim_score = max(0, min(100, sim_score))
    sim_components = {
        "Academic": _round(sim_scored.get("academic_component", 0)),
        "Attendance": _round(sim_scored.get("attendance_component", 0)),
        "LMS activity": _round(sim_scored.get("lms_component", 0)),
        "Placement": _round(sim_scored.get("placement_component", 0)),
        "Skills": _round(sim_scored.get("skills_component", 0)),
    }
    return {
        "student_id": payload.student_id,
        "student_name": str(row["name"]),
        "baseline_score": baseline_score,
        "simulated_score": sim_score,
        "delta": sim_score - baseline_score,
        "baseline_components": baseline_components,
        "simulated_components": sim_components,
        "adjusted_inputs": overrides,
        "note": "Hypothetical calculation only. This does not modify the student's actual record.",
    }


@app.post("/api/import")
async def import_data(files: list[UploadFile] = File(...)) -> dict[str, Any]:
    if not files:
        raise HTTPException(status_code=400, detail="Choose one or more CSV files")
    if len(files) > MAX_UPLOAD_FILES:
        raise HTTPException(status_code=413, detail=f"Upload at most {MAX_UPLOAD_FILES} CSV files at a time.")
    try:
        prepared = []
        for file in files:
            filename = file.filename or "upload.csv"
            if Path(filename).suffix.casefold() != ".csv":
                raise ValueError(f"'{filename}' is not a CSV file. Upload .csv files only.")
            content = await file.read(MAX_UPLOAD_BYTES + 1)
            if len(content) > MAX_UPLOAD_BYTES:
                raise HTTPException(status_code=413, detail=f"'{filename}' exceeds the 8 MB limit. Split it into smaller files.")
            prepared.append((filename, content))
        sources = read_uploaded_tables(prepared)
        if not sources:
            raise ValueError("No recognized CSV tables found. Include a students CSV plus optional academic, attendance, LMS, placement, skills, engagement, or feedback tables.")
        _build_views(sources, synthetic=False)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return {
        "message": "Student data integrated successfully.",
        "students": int(CURRENT["student_id"].nunique()),
        "sources": sorted(sources),
        "semester": int(CURRENT["semester"].max()),
        "data_coverage": _round(CURRENT["data_coverage"].mean()),
    }
