"""Input validation, feature construction, and semester-aware utilities."""

from __future__ import annotations

import numpy as np
import pandas as pd


NUMERIC_DEFAULTS = {
    "cgpa": 0.0,
    "internal_marks": 0.0,
    "exam_marks": 0.0,
    "attendance_pct": 0.0,
    "login_frequency": 0.0,
    "assignment_completion": 0.0,
    "technical_score": 50.0,
    "soft_skill_score": 50.0,
    "aptitude_score": 50.0,
    "coding_score": 50.0,
    "mock_interviews": 0.0,
    "backlogs": 0.0,
    "events": 0.0,
    "certifications": 0.0,
    "hackathons": 0.0,
    "satisfaction_score": 3.5,
    "faculty_feedback_score": 3.5,
}


def prepare_integrated_data(frame: pd.DataFrame) -> pd.DataFrame:
    """Standardize aliases, validate ranges, and retain missingness indicators."""
    data = frame.copy()
    aliases = {
        "dept": "department", "student_name": "name", "attendance": "attendance_pct",
        "attendance_percent": "attendance_pct", "lms_activity": "login_frequency",
        "login_count": "login_frequency", "assignment": "assignment_completion",
        "aptitude": "aptitude_score", "coding": "coding_score", "skills": "technical_score",
        "skill_score": "technical_score", "soft_skills": "soft_skill_score",
        "internal": "internal_marks", "exam": "exam_marks", "satisfaction": "satisfaction_score",
    }
    data = data.rename(columns={old: new for old, new in aliases.items() if old in data.columns and new not in data.columns})
    if "student_id" not in data.columns:
        raise ValueError("Student data must contain a student_id column so source files can be joined reliably.")
    data["student_id"] = data["student_id"].astype(str).str.strip()
    if "semester" not in data:
        data["semester"] = 6
    for column, default in NUMERIC_DEFAULTS.items():
        if column not in data:
            data[column] = default
        else:
            data[column] = pd.to_numeric(data[column], errors="coerce")
        data[f"{column}_missing"] = data[column].isna()
        # Missing numeric values are filled with the cohort median where available.
        median = data[column].median()
        data[column] = data[column].fillna(default if pd.isna(median) else median)
    data["cgpa"] = data["cgpa"].clip(0, 10)
    for column in ("internal_marks", "exam_marks", "attendance_pct", "assignment_completion", "technical_score", "soft_skill_score", "aptitude_score", "coding_score"):
        data[column] = data[column].clip(0, 100)
    for column in ("satisfaction_score", "faculty_feedback_score"):
        data[column] = data[column].clip(1, 5)
    data["semester"] = pd.to_numeric(data["semester"], errors="coerce").fillna(6).clip(1, 12).astype(int)
    data["name"] = data.get("name", data["student_id"].astype(str)).fillna(data["student_id"].astype(str))
    data["department"] = data.get("department", pd.Series("Unassigned", index=data.index)).fillna("Unassigned")
    return data


def current_cohort(history: pd.DataFrame) -> pd.DataFrame:
    """Return each student's latest integrated semester row."""
    order = history.sort_values(["student_id", "semester"])
    return order.groupby("student_id", as_index=False).tail(1).reset_index(drop=True)


def add_score_components(frame: pd.DataFrame) -> pd.DataFrame:
    """Create interpretable 0-100 components used by the stated weighted score."""
    data = frame.copy()
    academic = data["cgpa"].div(10).mul(100).mul(0.65) + data[["internal_marks", "exam_marks"]].mean(axis=1).mul(0.35)
    lms_logins = np.minimum(data["login_frequency"].div(24).mul(100), 100)
    placement = data["aptitude_score"].mul(0.45) + data["coding_score"].mul(0.45) + np.minimum(data["mock_interviews"].div(5).mul(100), 100).mul(0.10)
    engagement = data["events"].mul(10).add(data["certifications"].mul(8)).add(data["hackathons"].mul(15)).clip(0, 100)
    data["academic_component"] = academic.clip(0, 100)
    data["attendance_component"] = data["attendance_pct"]
    data["lms_component"] = lms_logins.mul(0.35) + data["assignment_completion"].mul(0.65)
    data["skills_component"] = data["technical_score"].mul(0.6) + data["soft_skill_score"].mul(0.4)
    data["placement_component"] = placement.clip(0, 100)
    data["engagement_component"] = engagement
    data["feedback_component"] = (data["satisfaction_score"].mul(20) + data["faculty_feedback_score"].mul(20)) / 2
    data["success_score"] = (
        data["academic_component"] * 0.35
        + data["attendance_component"] * 0.20
        + data["lms_component"] * 0.15
        + data["skills_component"] * 0.15
        + data["placement_component"] * 0.15
    ).round().clip(0, 100).astype(int)
    return data


def risk_reason(row: pd.Series) -> list[str]:
    reasons = []
    if row["attendance_pct"] < 65:
        reasons.append(f"Attendance is {row['attendance_pct']:.0f}% (below 65%)")
    if row["academic_component"] < 55:
        reasons.append(f"Academic component is {row['academic_component']:.0f}/100")
    if row["backlogs"] >= 2:
        reasons.append(f"{int(row['backlogs'])} active backlogs")
    if row["lms_component"] < 45:
        reasons.append(f"LMS/assignment engagement is {row['lms_component']:.0f}/100")
    if row["skills_component"] < 50:
        reasons.append(f"Skills assessment is {row['skills_component']:.0f}/100")
    if not reasons:
        reasons.append("No individual trigger; monitor the lowest score component")
    return reasons


def band_risk(row: pd.Series) -> str:
    if row["success_score"] < 55 or row["attendance_pct"] < 65 or row["backlogs"] >= 2:
        return "High"
    if row["success_score"] < 70 or row["attendance_pct"] < 75 or row["lms_component"] < 45:
        return "Medium"
    return "Low"
