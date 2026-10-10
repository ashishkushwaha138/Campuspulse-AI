"""Generate demo source systems and merge them into a student-semester table."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path
import re
import unicodedata

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
MERGE_KEYS = ["student_id", "semester"]

COLUMN_ALIASES = {
    "student_id": {"studentid", "student_no", "student_number", "roll_no", "roll_number", "enrollment_id", "enrollment_no", "enrollment_number", "enrolment_id", "enrolment_no", "registration_id", "registration_no", "registration_number", "reg_no"},
    "name": {"student_name", "full_name", "learner_name"},
    "department": {"dept", "department_name", "branch", "programme", "program", "course"},
    "semester": {"sem", "term", "current_semester", "current_term"},
    "cgpa": {"gpa", "cumulative_gpa", "grade_point_average", "cgpa_out_of_10"},
    "internal_marks": {"internal", "internal_score", "internal_assessment", "internal_assessment_marks", "sessional_marks"},
    "exam_marks": {"exam", "exam_score", "final_marks", "end_sem_marks", "external_marks", "marks", "total_marks", "obtained_marks"},
    "backlogs": {"active_backlogs", "backlog_count", "arrears"},
    "attendance_pct": {"attendance", "attendance_percent", "attendance_percentage", "attendance_rate", "attend_pct", "attendance_pct"},
    "login_frequency": {"login_count", "login_freq", "lms_logins", "lms_login_frequency", "logins_per_term"},
    "assignment_completion": {"assignment", "assignment_percent", "assignment_completion_pct", "assignment_completion_percent", "assignment_completion_rate"},
    "events": {"event_count", "events_attended", "event_participation"},
    "certifications": {"certificates", "certification_count"},
    "hackathons": {"hackathon_count"},
    "aptitude_score": {"aptitude", "aptitude_marks", "aptitude_test_score"},
    "coding_score": {"coding", "coding_marks", "programming_score", "coding_test_score"},
    "mock_interviews": {"mock_interview", "mock_interview_count", "interviews_completed"},
    "technical_score": {"skills", "skill_score", "technical_skills_score", "technical_assessment"},
    "soft_skill_score": {"soft_skills", "soft_skill", "communication_score"},
    "satisfaction_score": {"satisfaction", "student_satisfaction", "satisfaction_rating"},
    "faculty_feedback_score": {"faculty_feedback", "faculty_rating"},
}

SOURCE_FEATURES = {
    "academic": {"cgpa", "internal_marks", "exam_marks", "backlogs"},
    "attendance": {"attendance_pct"},
    "lms": {"login_frequency", "assignment_completion"},
    "engagement": {"events", "certifications", "hackathons"},
    "placement": {"aptitude_score", "coding_score", "mock_interviews"},
    "skills": {"technical_score", "soft_skill_score"},
    "feedback": {"satisfaction_score", "faculty_feedback_score"},
}

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
    if "semester" not in roster:
        roster["semester"] = 6
    if "department" not in roster:
        roster["department"] = "Unassigned"
    if "name" not in roster:
        roster["name"] = roster["student_id"].astype(str)
    roster["student_id"] = roster["student_id"].astype(str).str.strip().str.upper()
    roster = roster.loc[roster["student_id"].ne("") & roster["student_id"].str.casefold().ne("nan")]
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
        frame["student_id"] = frame["student_id"].astype(str).str.strip().str.upper()
        if "semester" not in frame:
            frame["semester"] = roster["semester"].max()
        frame["semester"] = pd.to_numeric(frame["semester"], errors="coerce").fillna(roster["semester"].max()).astype(int)
        frame = frame.drop_duplicates(MERGE_KEYS, keep="last")
        # A unified upload may serve as both the roster and the academic source.
        # Do not merge that table with itself, which creates name_x/name_y columns.
        if frame is roster_source or (key == "academic" and frame.equals(roster_source)):
            merged = frame
        elif key == "academic":
            merged = frame
        elif merged is None:
            merged = frame
        else:
            merged = merged.merge(frame, on=MERGE_KEYS, how="outer", suffixes=("", "_duplicate"))
            duplicate_cols = [col for col in merged.columns if col.endswith("_duplicate")]
            merged = merged.drop(columns=duplicate_cols)
    if merged is None:
        merged = roster[["student_id", "semester"]].copy()
    metadata = roster[[column for column in ("student_id", "name", "department", "year") if column in roster]].drop_duplicates("student_id")
    if merged is None:
        merged = roster[["student_id", "semester"]].copy()
    merged = merged.drop(columns=[column for column in ("name", "department", "year") if column in merged], errors="ignore")
    result = merged.merge(metadata, on="student_id", how="left", validate="many_to_one")
    if len(result) and result["name"].isna().all():
        raise ValueError("The student IDs in your roster and marks/attendance files do not match. Keep the same student_id (or roll_no) values in every CSV.")
    unmatched = result.loc[result["name"].isna(), "student_id"].drop_duplicates()
    if not unmatched.empty:
        examples = ", ".join(unmatched.head(3).astype(str).tolist())
        raise ValueError(f"{len(unmatched)} student ID(s) in marks/attendance data are missing from the roster (for example {examples}). Use matching IDs in every CSV.")
    available = set(result.columns)
    measures = set().union(*SOURCE_FEATURES.values())
    if not available.intersection(measures):
        raise ValueError("The uploaded files contain student details but no measurable academic, attendance, LMS, skills, or placement columns.")
    return result


def read_uploaded_tables(uploaded_files) -> dict[str, pd.DataFrame]:
    """Read varied CSV exports, standardize common headers, and infer each source."""
    sources: dict[str, list[tuple[str, pd.DataFrame]]] = {}
    filename_aliases = {
        "students": ("students", "student", "roster", "directory"),
        "academic": ("academic", "marks", "grades", "exam", "result"),
        "attendance": ("attendance", "attend"), "lms": ("lms", "learning", "assignment"),
        "engagement": ("engagement", "activities", "events"), "placement": ("placement", "aptitude", "coding"),
        "skills": ("skills", "skill"), "feedback": ("feedback", "survey"),
    }

    def normalize_header(value):
        value = unicodedata.normalize("NFKD", str(value).replace("\ufeff", "")).encode("ascii", "ignore").decode().casefold()
        return re.sub(r"[^a-z0-9]+", "_", value).strip("_")

    aliases = {normalize_header(alias): target for target, values in COLUMN_ALIASES.items() for alias in (target, *values)}
    for uploaded in uploaded_files:
        if isinstance(uploaded, tuple):
            filename, content = uploaded
            stream = BytesIO(content)
        else:
            filename, stream = getattr(uploaded, "name", "upload.csv"), uploaded
            if hasattr(stream, "seek"):
                stream.seek(0)
        try:
            frame = None
            for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
                try:
                    if hasattr(stream, "seek"):
                        stream.seek(0)
                    # Preserve identifiers like 000731; convert measures downstream.
                    frame = pd.read_csv(stream, encoding=encoding, sep=None, engine="python", dtype=str)
                    break
                except (UnicodeDecodeError, pd.errors.ParserError, ValueError):
                    continue
            if frame is None or frame.empty:
                raise ValueError("CSV is empty or could not be parsed")
        except Exception as error:
            raise ValueError(f"Could not read '{filename}': {error}. Save it as a comma-separated CSV and try again.") from error
        normalized = [normalize_header(column) for column in frame.columns]
        frame.columns = [aliases.get(column, column) for column in normalized]
        if frame.columns.duplicated().any():
            duplicate_names = sorted(set(frame.columns[frame.columns.duplicated()].tolist()))
            raise ValueError(f"'{filename}' has multiple columns that map to the same field: {', '.join(duplicate_names)}. Keep one column for each measure.")
        if "student_id" not in frame and "id" in frame and "name" in frame:
            frame = frame.rename(columns={"id": "student_id"})
        if "student_id" not in frame:
            raise ValueError(f"'{filename}' needs a student ID column (for example student_id, roll_no, enrollment_no, or registration_no).")
        frame["student_id"] = frame["student_id"].astype(str).str.strip().str.upper()
        frame = frame.loc[frame["student_id"].ne("") & frame["student_id"].str.casefold().ne("nan")]
        stem = normalize_header(Path(str(filename)).stem)
        matched = next((source for source, names in filename_aliases.items() if any(normalize_header(alias) in stem for alias in names)), None)
        found_groups = [source for source, features in SOURCE_FEATURES.items() if set(frame.columns).intersection(features)]
        has_roster = any(column in frame for column in ("name", "department", "year"))
        if matched is None:
            if len(found_groups) == 1:
                matched = found_groups[0]
            elif found_groups:
                matched = "academic"  # unified student export: metrics remain together
            elif has_roster:
                matched = "students"
            else:
                raise ValueError(f"Could not identify the data in '{filename}'. Use recognizable headers such as CGPA, attendance, assignment_completion, coding_score, or name.")
        sources.setdefault(matched, []).append((str(filename), frame))
        if matched == "students" and found_groups:
            # Student exports often contain identity plus all measured indicators.
            sources.setdefault("academic", []).append((str(filename), frame))
        # Keep identity metadata available when a single unified file contains metrics.
        if has_roster and found_groups and matched != "students":
            sources.setdefault("students", []).append((str(filename), frame[[column for column in ("student_id", "name", "department", "year", "semester") if column in frame]]))
    result = {}
    for source, named_frames in sources.items():
        combined = pd.concat([frame for _, frame in named_frames], ignore_index=True)
        keys = MERGE_KEYS if "semester" in combined else ["student_id"]
        duplicates = combined.loc[combined.duplicated(keys, keep=False), keys].drop_duplicates()
        if not duplicates.empty:
            example = ", ".join(str(value) for value in duplicates.iloc[0].tolist())
            names = ", ".join(dict.fromkeys(name for name, _ in named_frames))
            raise ValueError(f"The {source} data has duplicate records for the same student/semester (for example {example}) in {names}. Keep one row per key.")
        result[source] = combined
    return result
