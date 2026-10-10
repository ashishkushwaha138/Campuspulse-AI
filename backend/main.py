"""FastAPI API for the CampusPulse AI student success dashboard."""

from __future__ import annotations

import json
from io import BytesIO
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from typing import Any

import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from src.data_loader import generate_demo_sources, integrate_sources, read_uploaded_tables
from src.preprocessing import prepare_integrated_data
from src.risk_analysis import PLAYBOOKS, assign_segments, recommendations
from src.scoring import score_students

ROOT = Path(__file__).resolve().parents[1]
ACTION_FILE = ROOT / "data" / "interventions.json"
LOCK = RLock()
SOURCES = generate_demo_sources()
ALL_STUDENTS: pd.DataFrame
CURRENT: pd.DataFrame
SEGMENT_CENTERS: pd.DataFrame
LAST_ACTIONS: list[dict[str, Any]] = []
SYNTHETIC_MODE = True

app = FastAPI(title="CampusPulse AI", version="1.0.0", description="Student success analytics and intervention API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class InterventionRequest(BaseModel):
    student_id: str
    action: str = Field(min_length=3, max_length=240)
    status: str = "Assigned"
    admin_name: str = "Campus Administrator"


class ChatRequest(BaseModel):
    question: str = Field(min_length=2, max_length=600)
    admin_name: str = "Campus Administrator"


def _round(value: Any, digits: int = 1) -> float:
    return round(float(value), digits) if pd.notna(value) else 0.0


def _json_records(frame: pd.DataFrame) -> list[dict[str, Any]]:
    clean = frame.replace({float("inf"): None, float("-inf"): None}).where(pd.notna(frame), None)
    return clean.to_dict(orient="records")


def _student_records(frame: pd.DataFrame) -> list[dict[str, Any]]:
    fields = [
        "student_id", "name", "department", "year", "semester", "cgpa", "internal_marks", "exam_marks", "backlogs",
        "attendance_pct", "login_frequency", "assignment_completion", "events", "certifications", "hackathons",
        "aptitude_score", "coding_score", "mock_interviews", "technical_score", "soft_skill_score", "satisfaction_score",
        "academic_component", "attendance_component", "lms_component", "placement_component", "skills_component",
        "engagement_component", "success_score", "rule_risk", "risk_reasons", "placement_gap", "placement_ready",
        "segment", "recommendations",
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
    SOURCES = sources
    SYNTHETIC_MODE = synthetic
    integrated = integrate_sources(sources)
    if integrated.empty:
        raise ValueError("No student records were found in the uploaded files.")
    ALL_STUDENTS = score_students(prepare_integrated_data(integrated))
    latest_semester = int(ALL_STUDENTS["semester"].max())
    CURRENT = ALL_STUDENTS.loc[ALL_STUDENTS["semester"].eq(latest_semester)].copy()
    CURRENT, SEGMENT_CENTERS = assign_segments(CURRENT)
    CURRENT["recommendations"] = CURRENT.apply(recommendations, axis=1)


def _load_actions() -> None:
    global LAST_ACTIONS
    try:
        LAST_ACTIONS = json.loads(ACTION_FILE.read_text(encoding="utf-8")) if ACTION_FILE.exists() else []
    except (OSError, json.JSONDecodeError):
        LAST_ACTIONS = []


_build_views(SOURCES, synthetic=True)
_load_actions()


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "service": "CampusPulse AI", "students": int(len(CURRENT)), "data_mode": "synthetic demo" if SYNTHETIC_MODE else "uploaded CSV"}


@app.get("/api/overview")
def overview() -> dict[str, Any]:
    data = CURRENT
    latest_semester = int(data["semester"].max())
    trend_rows = ALL_STUDENTS.groupby("semester", as_index=False)["success_score"].mean()
    trend = [{"semester": f"Sem {int(row.semester)}", "score": _round(row.success_score)} for row in trend_rows.itertuples()]
    risk_counts = data["rule_risk"].value_counts()
    distribution = [{"name": name, "value": int(risk_counts.get(name, 0))} for name in ("Low", "Medium", "High")]
    departments = data.groupby("department", as_index=False).agg(
        students=("student_id", "nunique"), avg_score=("success_score", "mean"), high_risk=("rule_risk", lambda s: int(s.eq("High").sum()))
    ).sort_values("avg_score")
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
    attendance_low = int(watch["attendance_pct"].lt(75).sum())
    gap_count = int(data["placement_gap"].sum())
    if gap_count:
        return f"{gap_count} students have CGPA above 7.5 but below-median coding or aptitude. A focused placement bridge can address this gap."
    return f"{attendance_low} of {len(watch)} students on the watchlist are below 75% attendance. Begin with advisor outreach and barrier checks."


@app.get("/api/students")
def students(
    q: str = "", department: str = "All departments", risk: str = "All risk levels", segment: str = "All segments",
    placement_gap: bool = False, limit: int = 1000,
) -> dict[str, Any]:
    data = CURRENT.copy()
    if q.strip():
        term = q.casefold().strip()
        data = data.loc[data["name"].astype(str).str.casefold().str.contains(term, na=False) | data["student_id"].astype(str).str.casefold().str.contains(term, na=False)]
    if department != "All departments":
        data = data.loc[data["department"].eq(department)]
    if risk != "All risk levels":
        data = data.loc[data["rule_risk"].eq(risk)]
    if segment != "All segments":
        data = data.loc[data["segment"].eq(segment)]
    if placement_gap:
        data = data.loc[data["placement_gap"]]
    data = data.sort_values(["rule_risk", "success_score"], ascending=[True, True]).head(max(1, min(limit, 2000)))
    return {"students": _student_records(data), "total": int(len(data)), "departments": sorted(CURRENT["department"].dropna().unique().tolist())}


@app.get("/api/students/{student_id}")
def student_detail(student_id: str) -> dict[str, Any]:
    matches = CURRENT.loc[CURRENT["student_id"].eq(student_id)]
    if matches.empty:
        raise HTTPException(status_code=404, detail="Student not found")
    current = matches.iloc[0]
    history = ALL_STUDENTS.loc[ALL_STUDENTS["student_id"].eq(student_id)].sort_values("semester")
    result = _student_records(matches)[0]
    result["history"] = [{"semester": f"Sem {int(row.semester)}", "score": _round(row.success_score), "attendance": _round(row.attendance_pct)} for row in history.itertuples()]
    result["recommendations"] = recommendations(current)
    return result


@app.get("/api/segments")
def segments() -> dict[str, Any]:
    output = []
    for name in ("High Performers", "Silent Strugglers", "Placement Gap", "Disengaged"):
        group = CURRENT.loc[CURRENT["segment"].eq(name)]
        output.append({
            "name": name, "size": int(len(group)), "avg_score": _round(group["success_score"].mean()),
            "avg_attendance": _round(group["attendance_pct"].mean()), "avg_cgpa": _round(group["cgpa"].mean(), 2),
            "avg_placement": _round(group["placement_component"].mean()), "playbook": PLAYBOOKS[name],
            "students": _student_records(group.sort_values("success_score").head(5)),
        })
    return {"segments": output}


@app.get("/api/placement")
def placement() -> dict[str, Any]:
    data = CURRENT.copy()
    return {
        "medians": {"aptitude": _round(data["aptitude_score"].median()), "coding": _round(data["coding_score"].median())},
        "ready": int(data["placement_ready"].sum()), "gap": int(data["placement_gap"].sum()),
        "students": _student_records(data.sort_values("placement_component").tail(100)),
        "bands": [
            {"name": "Strong", "value": int(data["placement_component"].ge(75).sum())},
            {"name": "Building", "value": int(data["placement_component"].between(55, 74.99).sum())},
            {"name": "Needs support", "value": int(data["placement_component"].lt(55).sum())},
        ],
    }


@app.get("/api/insights")
def insights() -> dict[str, Any]:
    data = CURRENT
    watch = data.loc[data["rule_risk"].isin(["High", "Medium"])]
    consecutive = 0
    for student_id in watch["student_id"].unique():
        history = ALL_STUDENTS.loc[ALL_STUDENTS["student_id"].eq(student_id)].sort_values("semester")["attendance_pct"].to_numpy()
        if len(history) >= 3 and history[-1] < history[-2] < history[-3]:
            consecutive += 1
    insights_list = [
        {"title": "Attendance trend on the watchlist", "value": f"{(consecutive / max(len(watch), 1)):.0%}", "detail": f"{consecutive} watchlist students had attendance decline across two consecutive semester transitions.", "action": "Ask advisors to check for timetable, commute, health, or access barriers."},
        {"title": "Strong academics, placement gap", "value": str(int(data["placement_gap"].sum())), "detail": "Students have CGPA above 7.5 but coding or aptitude below the cohort median.", "action": "Create a short coding and aptitude bridge with a four-week mock-test review."},
        {"title": "Assignment completion opportunity", "value": f"{_round(data['assignment_completion'].mean())}%", "detail": "Average assignment completion across the current cohort.", "action": "Prioritize LMS nudges and faculty check-ins for students below 60%."},
        {"title": "Students needing academic support", "value": str(int((data["academic_component"] < 55).sum())), "detail": "Students have an academic component below 55/100.", "action": "Offer subject-level remedial sessions and a fortnightly progress review."},
        {"title": "Engagement and belonging", "value": f"{_round(data['engagement_component'].mean())}/100", "detail": "Cohort average based on events, certifications, and hackathons.", "action": "Connect low-engagement students with clubs, peer groups, or project teams."},
    ]
    return {"insights": insights_list, "generated_from": "synthetic demo cohort"}


@app.post("/api/chat")
def chat(payload: ChatRequest) -> dict[str, Any]:
    """Answer admin questions from the current cohort with traceable indicators."""
    question = payload.question.strip().casefold()
    data = CURRENT
    total = max(len(data), 1)
    high = data.loc[data["rule_risk"].eq("High")]
    watch = data.loc[data["rule_risk"].isin(["High", "Medium"])]
    gap = data.loc[data["placement_gap"]]
    related: list[dict[str, Any]] = []

    # Student-specific questions return the student's own measured signals first.
    match = None
    for _, row in data.iterrows():
        name = str(row["name"]).casefold()
        student_id = str(row["student_id"]).casefold()
        if student_id in question or (len(name) > 5 and name in question):
            match = row
            break
    if match is not None:
        student_id = str(match["student_id"])
        history = ALL_STUDENTS.loc[ALL_STUDENTS["student_id"].eq(student_id)].sort_values("semester")
        latest = history.iloc[-1]
        prior = history.iloc[-2] if len(history) > 1 else None
        reasons = "; ".join(match["risk_reasons"])
        score_change = f"Success score moved from {int(prior['success_score'])} to {int(latest['success_score'])} across the last two terms." if prior is not None else "No earlier semester record is available."
        answer = (
            f"{match['name']} has a Success Score of {int(match['success_score'])}/100 and is currently in the {match['rule_risk']} risk band. "
            f"Attendance is {float(match['attendance_pct']):.0f}%, CGPA is {float(match['cgpa']):.1f}, and placement readiness is {float(match['placement_component']):.0f}/100. "
            f"Key signals: {reasons}. {score_change} Suggested next step: {recommendations(match)[0]}"
        )
        related = [{"student_id": student_id, "name": str(match["name"]), "risk": str(match["rule_risk"]), "score": int(match["success_score"])}]
    elif any(word in question for word in ("placement", "coding", "aptitude", "job", "ready")):
        answer = (
            f"{int(data['placement_ready'].sum())} of {len(data)} students meet the current placement-ready rule. "
            f"{len(gap)} students have CGPA above 7.5 but coding or aptitude below the cohort median "
            f"(coding median {data['coding_score'].median():.0f}, aptitude median {data['aptitude_score'].median():.0f}). "
            "I recommend a four-week coding and aptitude bridge, followed by one mock assessment to check progress."
        )
        related = _student_records(gap.sort_values("placement_component").head(5))
    elif any(word in question for word in ("attendance", "absent", "presence")):
        low_attendance = data.loc[data["attendance_pct"].lt(65)]
        falling = 0
        for student_id in watch["student_id"].unique():
            history = ALL_STUDENTS.loc[ALL_STUDENTS["student_id"].eq(student_id)].sort_values("semester")["attendance_pct"].to_numpy()
            if len(history) >= 3 and history[-1] < history[-2] < history[-3]:
                falling += 1
        answer = (
            f"Average attendance is {data['attendance_pct'].mean():.1f}%. {len(low_attendance)} students are below 65%, "
            f"and {falling} students on the watchlist saw attendance decline over two semester transitions. "
            "Start with supportive advisor check-ins to understand schedule, commute, wellbeing, or access barriers."
        )
        related = _student_records(low_attendance.sort_values("attendance_pct").head(5))
    elif any(word in question for word in ("segment", "cluster", "silent struggler", "disengaged", "high performer")):
        requested = next((name for name in ("High Performers", "Silent Strugglers", "Placement Gap", "Disengaged") if name.casefold() in question), None)
        if requested:
            group = data.loc[data["segment"].eq(requested)]
            playbook = PLAYBOOKS[requested]
            answer = f"The {requested} segment contains {len(group)} students ({len(group) / total:.0%} of this cohort), with an average Success Score of {group['success_score'].mean():.0f}. Suggested playbook: " + "; ".join(playbook) + "."
            related = _student_records(group.sort_values("success_score").head(5))
        else:
            counts = data["segment"].value_counts()
            answer = "Current segment sizes: " + ", ".join(f"{name}: {int(counts.get(name, 0))}" for name in ("High Performers", "Silent Strugglers", "Placement Gap", "Disengaged")) + ". Open Student Segments to review each targeted intervention playbook."
    elif any(word in question for word in ("score", "formula", "weight", "success")):
        answer = (
            f"The cohort average Success Score is {data['success_score'].mean():.0f}/100. "
            "The transparent formula weights Academic 35%, Attendance 20%, LMS activity 15%, Skills 15%, and Placement readiness 15%. "
            "For each student, the profile shows the six component values and the lowest score drivers. The dashboard uses rules for support flags; the demo model is only supplementary."
        )
    elif any(word in question for word in ("risk", "at-risk", "watch", "attention", "who needs")):
        priority = watch.sort_values(["rule_risk", "success_score"], ascending=[True, True]).head(5)
        answer = (
            f"{len(high)} students are in the High risk band and {len(watch) - len(high)} are in Medium/watch, so {len(watch)} of {len(data)} students may benefit from review. "
            "Start with the High risk students, then check attendance and backlog context before assigning support."
        )
        related = _student_records(priority)
    else:
        answer = (
            f"The cohort tracks {len(data)} students with an average Success Score of {data['success_score'].mean():.0f}/100. "
            f"{len(watch)} are in the High or Medium review bands, {int(data['placement_ready'].sum())} meet placement-ready thresholds, and {len(gap)} have a placement gap. "
            "Try asking about a student by name, attendance decline, placement gaps, risk flags, segments, or the score formula."
        )
    return {"answer": answer, "related_students": related, "generated_from": "current cohort analytics", "synthetic_data": SYNTHETIC_MODE}


@app.get("/api/actions")
def actions() -> dict[str, Any]:
    return {"actions": LAST_ACTIONS[:100]}


@app.post("/api/interventions")
def assign_intervention(payload: InterventionRequest) -> dict[str, Any]:
    student = CURRENT.loc[CURRENT["student_id"].eq(payload.student_id)]
    if student.empty:
        raise HTTPException(status_code=404, detail="Student not found")
    item = {
        "id": f"act-{int(datetime.now(tz=timezone.utc).timestamp() * 1000)}",
        "student_id": payload.student_id, "student_name": str(student.iloc[0]["name"]), "department": str(student.iloc[0]["department"]),
        "action": payload.action, "status": "Assigned", "admin_name": payload.admin_name,
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
    }
    with LOCK:
        LAST_ACTIONS.insert(0, item)
        ACTION_FILE.parent.mkdir(parents=True, exist_ok=True)
        ACTION_FILE.write_text(json.dumps(LAST_ACTIONS[:500], indent=2), encoding="utf-8")
    return {"action": item, "message": "Intervention assigned and saved."}


@app.post("/api/import")
async def import_data(files: list[UploadFile] = File(...)) -> dict[str, Any]:
    if not files:
        raise HTTPException(status_code=400, detail="Choose one or more CSV files")
    try:
        prepared = []
        for file in files:
            content = await file.read()
            table = BytesIO(content)
            table.name = file.filename or "upload.csv"
            prepared.append(table)
        sources = read_uploaded_tables(prepared)
        if not sources:
            raise ValueError("No recognized CSV tables found. Include a students CSV and optional academic, attendance, LMS, placement, skills, engagement, or feedback tables.")
        _build_views(sources, synthetic=False)
    except Exception as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return {"message": "Student data integrated successfully.", "students": int(CURRENT["student_id"].nunique()), "sources": sorted(sources)}
