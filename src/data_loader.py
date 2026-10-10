"""Generate demo source systems and merge them into a student-semester table."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
MERGE_KEYS = ["student_id", "semester"]

FIRST_NAMES = [
    "Aarav", "Aditi", "Aditya", "Ananya", "Arjun", "Diya", "Ishaan", "Kabir",
    "Kavya", "Meera", "Neha", "Priya", "Rohan", "Sana", "Vihaan", "Zoya",
    "Aanya", "Advait", "Anika", "Dev", "Ira", "Kartik", "Mira", "Nikhil",
    "Reyansh", "Rhea", "Samar", "Tara", "Yash", "Aarohi", "Ishan", "Naina",
]
LAST_NAMES = [
    "Mehta", "Nair", "Kapoor", "Rao", "Shah", "Joshi", "Verma", "Menon",
    "Singh", "Patel", "Kulkarni", "Khan", "Bose", "Iyer", "Malhotra", "Das",
    "Chatterjee", "Reddy", "Fernandes", "Gupta", "Pillai", "Saxena", "Mishra",
    "Desai", "Bhat", "Mukherjee", "Jain", "Kaur", "Thomas", "Shetty",
]
DEPARTMENTS = ["Computer Science", "Information Technology", "Electronics", "Mechanical", "Civil", "BCA"]

PROFILES = {
    "High Performers": {"cgpa": 8.55, "attendance": 91, "lms": 87, "assignment": 91, "technical": 86, "soft": 86, "aptitude": 83, "coding": 84, "clubs": 3.1, "satisfaction": 4.45, "interviews": 3.0},
    "Silent Strugglers": {"cgpa": 6.25, "attendance": 86, "lms": 64, "assignment": 61, "technical": 58, "soft": 69, "aptitude": 57, "coding": 52, "clubs": 1.6, "satisfaction": 3.55, "interviews": 1.0},
    "Placement Gap": {"cgpa": 8.30, "attendance": 87, "lms": 80, "assignment": 82, "technical": 74, "soft": 76, "aptitude": 56, "coding": 50, "clubs": 2.2, "satisfaction": 4.05, "interviews": 1.0},
    "Disengaged": {"cgpa": 6.00, "attendance": 57, "lms": 37, "assignment": 43, "technical": 47, "soft": 51, "aptitude": 45, "coding": 41, "clubs": 0.5, "satisfaction": 3.05, "interviews": 0.4},
    "Balanced Progress": {"cgpa": 7.25, "attendance": 78, "lms": 71, "assignment": 73, "technical": 69, "soft": 73, "aptitude": 68, "coding": 66, "clubs": 1.8, "satisfaction": 3.85, "interviews": 1.7},
}


def _bounded(value: float, low: float, high: float) -> float:
    return float(np.clip(value, low, high))


def generate_demo_sources(n_students: int = 500, seed: int = 20261010) -> dict[str, pd.DataFrame]:
    """Create reproducible source-system CSV tables with 6 terms per student."""
    rng = np.random.default_rng(seed)
    labels = list(PROFILES)
    weights = [0.20, 0.16, 0.20, 0.15, 0.29]
    profile_names = rng.choice(labels, size=n_students, p=weights)
    roster_rows: list[dict] = []
    academic: list[dict] = []
    attendance: list[dict] = []
    lms: list[dict] = []
    engagement: list[dict] = []
    placement: list[dict] = []
    skills: list[dict] = []
    feedback: list[dict] = []

    for index, profile_name in enumerate(profile_names, start=1):
        profile = PROFILES[str(profile_name)]
        student_id = f"CP{index:05d}"
        first = FIRST_NAMES[(index - 1) % len(FIRST_NAMES)]
        last = LAST_NAMES[((index - 1) // len(FIRST_NAMES) + index * 3) % len(LAST_NAMES)]
        name = f"{first} {last}"
        department = DEPARTMENTS[(index * 7 + index // 9) % len(DEPARTMENTS)]
        roster_rows.append({"student_id": student_id, "name": name, "department": department, "year": 3, "semester": 6})

        # Student-specific trajectory creates consistent but non-identical semester history.
        trend = rng.normal(0.20 if profile_name in ("High Performers", "Balanced Progress") else -0.02, 0.20)
        student_offsets = rng.normal(0, 3.2, size=10)
        for semester in range(1, 7):
            progress = semester - 6
            cgpa = _bounded(rng.normal(profile["cgpa"] + trend * progress, 0.28), 4.0, 10.0)
            internal = _bounded(rng.normal((profile["cgpa"] - 4) * 15.4 + 7 + trend * progress * 3, 7), 25, 99)
            exam = _bounded(rng.normal((profile["cgpa"] - 4) * 14.8 + 10 + trend * progress * 3, 8), 25, 99)
            attendance_pct = _bounded(rng.normal(profile["attendance"] + student_offsets[0] + progress * trend * 1.5, 7), 35, 100)
            login_frequency = int(np.clip(rng.normal(profile["lms"] * 0.24 + student_offsets[1] * 0.4, 3.3), 1, 30))
            assignment_completion = _bounded(rng.normal(profile["assignment"] + student_offsets[2] + progress * trend * 2, 8), 15, 100)
            apt = _bounded(rng.normal(profile["aptitude"] + student_offsets[3], 8), 15, 100)
            code = _bounded(rng.normal(profile["coding"] + student_offsets[4], 9), 10, 100)
            technical = _bounded(rng.normal(profile["technical"] + student_offsets[5], 7), 15, 100)
            soft = _bounded(rng.normal(profile["soft"] + student_offsets[6], 7), 20, 100)
            setback = int(np.clip(round((7.2 - profile["cgpa"]) / 2 + rng.normal(0.15, 0.5)), 0, 3))
            active_backlogs = max(0, setback - (1 if semester > 3 and trend > 0.15 else 0))
            academic.append({"student_id": student_id, "semester": semester, "cgpa": round(cgpa, 2), "internal_marks": round(internal, 1), "exam_marks": round(exam, 1), "backlogs": active_backlogs})
            attendance.append({"student_id": student_id, "semester": semester, "attendance_pct": round(attendance_pct, 1)})
            lms.append({"student_id": student_id, "semester": semester, "login_frequency": login_frequency, "assignment_completion": round(assignment_completion, 1)})
            engagement.append({"student_id": student_id, "semester": semester, "events": int(np.clip(rng.poisson(max(0.2, profile["clubs"])), 0, 10)), "certifications": int(np.clip(rng.poisson(0.5 + profile["clubs"] / 2), 0, 5)), "hackathons": int(rng.binomial(2, min(0.8, 0.08 + profile["clubs"] * 0.15)))})
            placement.append({"student_id": student_id, "semester": semester, "aptitude_score": round(apt, 1), "coding_score": round(code, 1), "mock_interviews": int(np.clip(rng.poisson(profile["interviews"] / 2), 0, 6))})
            skills.append({"student_id": student_id, "semester": semester, "technical_score": round(technical, 1), "soft_skill_score": round(soft, 1)})
            feedback.append({"student_id": student_id, "semester": semester, "satisfaction_score": round(_bounded(rng.normal(profile["satisfaction"], 0.42), 1, 5), 1), "faculty_feedback_score": round(_bounded(rng.normal(profile["satisfaction"] + 0.05, 0.48), 1, 5), 1)})

    return {
        "students": pd.DataFrame(roster_rows),
        "academic": pd.DataFrame(academic),
        "attendance": pd.DataFrame(attendance),
        "lms": pd.DataFrame(lms),
        "engagement": pd.DataFrame(engagement),
        "placement": pd.DataFrame(placement),
        "skills": pd.DataFrame(skills),
        "feedback": pd.DataFrame(feedback),
    }


def persist_demo_sources(sources: dict[str, pd.DataFrame], data_dir: Path = DATA_DIR) -> None:
    """Write the reproducible source tables so judges can inspect integration inputs."""
    data_dir.mkdir(parents=True, exist_ok=True)
    for name, frame in sources.items():
        frame.to_csv(data_dir / f"{name}.csv", index=False)
    (data_dir / "README.md").write_text(
        "# Generated demo source tables\n\n"
        "These CSV files are reproducibly generated by `src/data_loader.py`; every row is synthetic. "
        "The app joins semester-level tables on `student_id` + `semester`, then selects semester 6 for current cohort views.\n",
        encoding="utf-8",
    )


def integrate_sources(sources: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """Join independent source tables by the shared student and semester keys."""
    roster_source = sources.get("students")
    if roster_source is None:
        # Accept a unified export as well as the recommended set of source CSVs.
        roster_source = next((frame for frame in sources.values() if "student_id" in frame and ("name" in frame or "student_name" in frame)), None)
    if roster_source is None:
        raise ValueError("Upload students.csv with student_id, name, department, and semester columns, or a unified CSV that contains those fields.")
    roster = roster_source.copy()
    rename = {"department": "department", "dept": "department", "student_name": "name", "current_semester": "semester"}
    roster = roster.rename(columns={key: value for key, value in rename.items() if key in roster.columns})
    if "semester" not in roster:
        roster["semester"] = 6
    if "department" not in roster:
        roster["department"] = "Unassigned"
    if "name" not in roster:
        roster["name"] = roster["student_id"].astype(str)
    roster["student_id"] = roster["student_id"].astype(str).str.strip()
    roster["semester"] = pd.to_numeric(roster["semester"], errors="coerce").fillna(6).astype(int)
    roster = roster.drop_duplicates("student_id", keep="last")

    merged: pd.DataFrame | None = None
    for key in ("academic", "attendance", "lms", "placement", "skills", "engagement", "feedback"):
        frame = sources.get(key)
        if frame is None or frame.empty:
            continue
        frame = frame.copy()
        if "student_id" not in frame:
            continue
        frame["student_id"] = frame["student_id"].astype(str).str.strip()
        if "semester" not in frame:
            frame["semester"] = roster["semester"].max()
        frame["semester"] = pd.to_numeric(frame["semester"], errors="coerce").fillna(roster["semester"].max()).astype(int)
        frame = frame.drop_duplicates(MERGE_KEYS, keep="last")
        if key == "academic":
            merged = frame
        elif merged is None:
            merged = frame
        else:
            merged = merged.merge(frame, on=MERGE_KEYS, how="outer", suffixes=("", "_duplicate"))
            duplicate_cols = [col for col in merged.columns if col.endswith("_duplicate")]
            merged = merged.drop(columns=duplicate_cols)
    if merged is None:
        merged = roster[["student_id", "semester"]].copy()
    return merged.merge(roster.drop(columns=["semester"], errors="ignore"), on="student_id", how="left", validate="many_to_one")


def read_uploaded_tables(uploaded_files) -> dict[str, pd.DataFrame]:
    """Read CSV uploads by filename; a single all-in-one CSV is accepted as academic data."""
    sources: dict[str, pd.DataFrame] = {}
    aliases = {"students": ("students", "roster"), "academic": ("academic", "marks", "grades"), "attendance": ("attendance",), "lms": ("lms", "learning"), "engagement": ("engagement", "activities"), "placement": ("placement",), "skills": ("skills",), "feedback": ("feedback",)}
    for uploaded in uploaded_files:
        name = Path(uploaded.name).stem.lower()
        frame = pd.read_csv(uploaded)
        frame.columns = [column.strip().lower().replace(" ", "_") for column in frame.columns]
        matched = next((source for source, names in aliases.items() if any(alias in name for alias in names)), None)
        if matched is None and "student_id" in frame.columns and any(col in frame.columns for col in ("cgpa", "attendance", "lms", "attendance_pct")):
            matched = "academic"
        if matched:
            sources[matched] = frame
            if matched == "students" and any(col in frame.columns for col in ("cgpa", "attendance", "attendance_pct", "lms")):
                sources["academic"] = frame
    return sources
