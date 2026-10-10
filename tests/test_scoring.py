"""Unit tests for CampusPulse AI scoring, risk, and data pipeline."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np
import pandas as pd
import pytest

from src.preprocessing import add_score_components, band_risk, risk_reason, prepare_integrated_data
from src.scoring import score_students
from src.data_loader import generate_demo_sources, integrate_sources
from src.risk_analysis import assign_segments, recommendations


# ─── helpers ────────────────────────────────────────────────────────────────

def _make_row(**kwargs):
    """Return a minimal student row with sensible defaults."""
    defaults = dict(
        student_id="TST001", name="Test Student", department="CS", semester=6, year=3,
        cgpa=7.5, internal_marks=70.0, exam_marks=72.0, attendance_pct=80.0,
        login_frequency=15.0, assignment_completion=75.0, technical_score=70.0,
        soft_skill_score=68.0, aptitude_score=72.0, coding_score=70.0,
        mock_interviews=2.0, events=2.0, certifications=1.0, hackathons=1.0,
        satisfaction_score=3.8, faculty_feedback_score=3.9, backlogs=0,
    )
    defaults.update(kwargs)
    return pd.Series(defaults)


def _make_frame(**kwargs):
    return pd.DataFrame([_make_row(**kwargs).to_dict()])


def _scored_frame(**kwargs):
    frame = _make_frame(**kwargs)
    # Add missingness flags expected by add_score_components
    for col in ["cgpa", "internal_marks", "exam_marks", "attendance_pct", "login_frequency",
                "assignment_completion", "technical_score", "soft_skill_score", "aptitude_score",
                "coding_score", "mock_interviews", "events", "certifications", "hackathons",
                "satisfaction_score", "faculty_feedback_score", "backlogs"]:
        frame[f"{col}_missing"] = False
    frame["academic_missing"] = False
    frame["attendance_missing"] = False
    frame["lms_missing"] = False
    frame["skills_missing"] = False
    frame["placement_missing"] = False
    frame["engagement_missing"] = False
    frame["data_coverage"] = 100
    frame["missing_indicators"] = [[] for _ in range(len(frame))]
    frame["invalid_value_count"] = 0
    return add_score_components(frame)


# ─── Phase 4: Score formula ──────────────────────────────────────────────────

class TestScoreWeights:
    def test_weights_sum_to_one(self):
        """0.35 + 0.20 + 0.15 + 0.15 + 0.15 = 1.00"""
        assert abs(0.35 + 0.20 + 0.15 + 0.15 + 0.15 - 1.0) < 1e-9

    def test_perfect_student_scores_100(self):
        frame = _scored_frame(
            cgpa=10.0, internal_marks=100.0, exam_marks=100.0,
            attendance_pct=100.0, login_frequency=24.0, assignment_completion=100.0,
            technical_score=100.0, soft_skill_score=100.0,
            aptitude_score=100.0, coding_score=100.0, mock_interviews=5.0,
        )
        assert int(frame.iloc[0]["success_score"]) == 100

    def test_zero_student_scores_low(self):
        frame = _scored_frame(
            cgpa=0.0, internal_marks=0.0, exam_marks=0.0,
            attendance_pct=0.0, login_frequency=0.0, assignment_completion=0.0,
            technical_score=0.0, soft_skill_score=0.0,
            aptitude_score=0.0, coding_score=0.0, mock_interviews=0.0,
        )
        assert int(frame.iloc[0]["success_score"]) == 0

    def test_score_is_bounded_0_100(self):
        for cgpa in [0, 5, 10]:
            for att in [0, 50, 100]:
                frame = _scored_frame(cgpa=float(cgpa), attendance_pct=float(att))
                score = int(frame.iloc[0]["success_score"])
                assert 0 <= score <= 100, f"score={score} out of range for cgpa={cgpa}, att={att}"

    def test_manual_formula_matches_stored_score(self):
        frame = _scored_frame()
        row = frame.iloc[0]
        manual = round(
            row["academic_component"] * 0.35
            + row["attendance_component"] * 0.20
            + row["lms_component"] * 0.15
            + row["skills_component"] * 0.15
            + row["placement_component"] * 0.15
        )
        assert int(row["success_score"]) == int(manual)

    def test_academic_component_formula(self):
        """academic = 0.65 * (cgpa/10*100) + 0.35 * mean(internal, exam)"""
        frame = _scored_frame(cgpa=8.0, internal_marks=80.0, exam_marks=80.0)
        expected = 0.65 * 80.0 + 0.35 * 80.0  # = 80.0
        assert abs(float(frame.iloc[0]["academic_component"]) - expected) < 0.5

    def test_lms_component_formula(self):
        """lms = 0.35 * min(logins/24*100,100) + 0.65 * assignment_completion"""
        frame = _scored_frame(login_frequency=12.0, assignment_completion=80.0)
        login_part = min(12 / 24 * 100, 100) * 0.35
        assign_part = 80.0 * 0.65
        expected = login_part + assign_part
        assert abs(float(frame.iloc[0]["lms_component"]) - expected) < 0.5

    def test_placement_component_formula(self):
        """placement = 0.45*aptitude + 0.45*coding + 0.10*min(mock/5*100,100)"""
        frame = _scored_frame(aptitude_score=80.0, coding_score=70.0, mock_interviews=5.0)
        expected = 0.45 * 80 + 0.45 * 70 + 0.10 * 100
        assert abs(float(frame.iloc[0]["placement_component"]) - expected) < 0.5

    def test_skills_component_formula(self):
        """skills = 0.60*technical + 0.40*soft"""
        frame = _scored_frame(technical_score=80.0, soft_skill_score=60.0)
        expected = 0.60 * 80 + 0.40 * 60
        assert abs(float(frame.iloc[0]["skills_component"]) - expected) < 0.5

    def test_score_increases_with_attendance(self):
        low = _scored_frame(attendance_pct=50.0).iloc[0]["success_score"]
        high = _scored_frame(attendance_pct=95.0).iloc[0]["success_score"]
        assert high > low

    def test_score_increases_with_cgpa(self):
        low = _scored_frame(cgpa=4.0).iloc[0]["success_score"]
        high = _scored_frame(cgpa=9.5).iloc[0]["success_score"]
        assert high > low


# ─── Phase 3: Risk classification ───────────────────────────────────────────

class TestRiskBand:
    def _row_with_score(self, score, attendance=80.0, backlogs=0, lms=60.0):
        base = _scored_frame(attendance_pct=attendance, backlogs=backlogs).iloc[0].to_dict()
        base["success_score"] = score
        base["lms_component"] = lms
        base["data_coverage"] = 100
        return pd.Series(base)

    def test_high_risk_low_score(self):
        row = self._row_with_score(score=50)
        assert band_risk(row) == "High"

    def test_high_risk_low_attendance(self):
        row = self._row_with_score(score=75, attendance=60.0)
        assert band_risk(row) == "High"

    def test_high_risk_backlogs(self):
        row = self._row_with_score(score=75, backlogs=2)
        assert band_risk(row) == "High"

    def test_medium_risk_moderate_score(self):
        row = self._row_with_score(score=65, attendance=80.0)
        assert band_risk(row) == "Medium"

    def test_medium_risk_borderline_attendance(self):
        row = self._row_with_score(score=75, attendance=72.0)
        assert band_risk(row) == "Medium"

    def test_medium_risk_low_lms(self):
        row = self._row_with_score(score=75, lms=40.0)
        assert band_risk(row) == "Medium"

    def test_low_risk_good_student(self):
        row = self._row_with_score(score=80, attendance=90.0)
        assert band_risk(row) == "Low"

    def test_high_boundary_score_54(self):
        row = self._row_with_score(score=54)
        assert band_risk(row) == "High"

    def test_medium_boundary_score_55(self):
        row = self._row_with_score(score=55, attendance=80.0)
        assert band_risk(row) == "Medium"

    def test_low_boundary_score_70(self):
        row = self._row_with_score(score=70, attendance=80.0)
        assert band_risk(row) == "Low"

    def test_missing_attendance_does_not_trigger_high(self):
        row = self._row_with_score(score=80, attendance=60.0)
        row["attendance_missing"] = True
        # attendance is missing, so attendance rule should not fire
        # but score=80 > 55 and 80 > 70, so should be Low
        result = band_risk(row)
        assert result == "Low"

    def test_low_coverage_suppresses_score_based_rule(self):
        row = self._row_with_score(score=40)
        row["data_coverage"] = 50  # below 80 threshold
        row["attendance_pct"] = 85.0  # good attendance
        row["attendance_missing"] = False
        row["academic_missing"] = False
        row["backlogs"] = 0
        row["backlogs_missing"] = False
        # score rule suppressed; attendance is fine; backlogs is 0 → Low
        result = band_risk(row)
        assert result == "Low"


# ─── Risk reasons ────────────────────────────────────────────────────────────

class TestRiskReason:
    def test_low_attendance_gives_reason(self):
        frame = _scored_frame(attendance_pct=60.0)
        row = frame.iloc[0]
        row["data_coverage"] = 100
        reasons = risk_reason(row)
        assert any("60" in r or "attendance" in r.lower() for r in reasons)

    def test_no_reasons_for_good_student(self):
        frame = _scored_frame(
            cgpa=9.0, attendance_pct=92.0, technical_score=85.0,
            soft_skill_score=85.0, coding_score=85.0, aptitude_score=85.0,
            assignment_completion=90.0, login_frequency=20.0,
        )
        row = frame.iloc[0]
        row["data_coverage"] = 100
        reasons = risk_reason(row)
        assert len(reasons) == 1
        assert "no individual trigger" in reasons[0].lower()

    def test_backlogs_give_reason(self):
        frame = _scored_frame(backlogs=3)
        row = frame.iloc[0]
        row["data_coverage"] = 100
        reasons = risk_reason(row)
        assert any("backlog" in r.lower() for r in reasons)

    def test_missing_data_reported_in_reasons(self):
        frame = _scored_frame()
        row = frame.iloc[0].copy()
        row["missing_indicators"] = ["attendance", "LMS"]
        reasons = risk_reason(row)
        assert any("missing" in r.lower() for r in reasons)


# ─── Phase 5: Data pipeline ──────────────────────────────────────────────────

class TestDataPipeline:
    @pytest.fixture(scope="class")
    def demo_pipeline(self):
        sources = generate_demo_sources(n_students=80, seed=42)
        integrated = integrate_sources(sources)
        prepped = prepare_integrated_data(integrated)
        scored = score_students(prepped)
        return scored

    def test_demo_sources_generate(self):
        sources = generate_demo_sources(n_students=20, seed=1)
        assert "students" in sources
        assert len(sources["students"]) == 20

    def test_integrate_sources_produces_rows(self, demo_pipeline):
        assert len(demo_pipeline) > 0

    def test_no_null_success_scores(self, demo_pipeline):
        assert demo_pipeline["success_score"].isna().sum() == 0

    def test_scores_in_range(self, demo_pipeline):
        assert demo_pipeline["success_score"].between(0, 100).all()

    def test_risk_column_values(self, demo_pipeline):
        valid = {"High", "Medium", "Low"}
        assert set(demo_pipeline["rule_risk"].unique()).issubset(valid)

    def test_all_three_risk_bands_present(self, demo_pipeline):
        assert set(demo_pipeline["rule_risk"].unique()) == {"High", "Medium", "Low"}

    def test_data_coverage_in_range(self, demo_pipeline):
        assert demo_pipeline["data_coverage"].between(0, 100).all()

    def test_placement_flags_consistent(self, demo_pipeline):
        # placement_gap requires cgpa > 7.5, so no student with cgpa <= 7.5 should have it
        gap = demo_pipeline[demo_pipeline["placement_gap"]]
        assert (gap["cgpa"] > 7.5).all()

    def test_placement_ready_implies_high_cgpa(self, demo_pipeline):
        ready = demo_pipeline[demo_pipeline["placement_ready"]]
        assert (ready["cgpa"] >= 7.5).all()

    def test_current_cohort_one_row_per_student(self, demo_pipeline):
        from src.preprocessing import current_cohort
        current = current_cohort(demo_pipeline)
        assert current["student_id"].nunique() == len(current)

    def test_segmentation_assigns_four_segments(self, demo_pipeline):
        from src.preprocessing import current_cohort
        current = current_cohort(demo_pipeline)
        segmented, _ = assign_segments(current)
        names = set(segmented["segment"].unique())
        expected = {"High Performers", "Silent Strugglers", "Placement Gap", "Disengaged"}
        assert names == expected

    def test_segmentation_covers_all_students(self, demo_pipeline):
        from src.preprocessing import current_cohort
        current = current_cohort(demo_pipeline)
        segmented, _ = assign_segments(current)
        assert segmented["segment"].isna().sum() == 0


# ─── Phase 10: CSV validation ────────────────────────────────────────────────

class TestCsvValidation:
    def test_missing_student_id_raises(self):
        from src.data_loader import read_uploaded_tables
        content = b"name,cgpa\nAlice,8.5\n"
        with pytest.raises(ValueError, match="student"):
            read_uploaded_tables([("students.csv", content)])

    def test_empty_csv_raises(self):
        from src.data_loader import read_uploaded_tables
        content = b""
        with pytest.raises(ValueError):
            read_uploaded_tables([("students.csv", content)])

    def test_valid_minimal_csv_works(self):
        from src.data_loader import read_uploaded_tables
        content = b"student_id,name,department\nS001,Alice,CS\nS002,Bob,IT\n"
        result = read_uploaded_tables([("students.csv", content)])
        assert "students" in result
        assert len(result["students"]) == 2

    def test_alias_headers_normalized(self):
        from src.data_loader import read_uploaded_tables
        content = b"roll_no,student_name,dept,attendance_percent\nS001,Alice,CS,88\n"
        result = read_uploaded_tables([("students.csv", content)])
        cols = set(result["students"].columns)
        assert "student_id" in cols

    def test_range_clipping_in_prepare(self):
        frame = _make_frame(cgpa=15.0, attendance_pct=110.0, coding_score=-5.0)
        for col in ["cgpa", "attendance_pct", "coding_score", "internal_marks", "exam_marks",
                    "login_frequency", "assignment_completion", "technical_score", "soft_skill_score",
                    "aptitude_score", "mock_interviews", "events", "certifications", "hackathons",
                    "satisfaction_score", "faculty_feedback_score", "backlogs"]:
            if col not in frame.columns:
                frame[col] = 0.0
        result = prepare_integrated_data(frame)
        assert result.iloc[0]["cgpa"] <= 10.0
        assert result.iloc[0]["attendance_pct"] <= 100.0
        assert result.iloc[0]["coding_score"] >= 0.0

    def test_invalid_values_counted(self):
        frame = _make_frame(cgpa=12.0, attendance_pct=105.0)
        for col in ["cgpa", "attendance_pct", "coding_score", "internal_marks", "exam_marks",
                    "login_frequency", "assignment_completion", "technical_score", "soft_skill_score",
                    "aptitude_score", "mock_interviews", "events", "certifications", "hackathons",
                    "satisfaction_score", "faculty_feedback_score", "backlogs"]:
            if col not in frame.columns:
                frame[col] = 0.0
        result = prepare_integrated_data(frame)
        assert result.iloc[0]["invalid_value_count"] >= 2


# ─── Recommendations ─────────────────────────────────────────────────────────

class TestRecommendations:
    def test_low_attendance_recommends_advisor(self):
        frame = _scored_frame(attendance_pct=60.0)
        row = frame.iloc[0].copy()
        row["data_coverage"] = 100
        row["placement_gap"] = False
        recs = recommendations(row)
        assert any("advisor" in r.lower() or "attendance" in r.lower() for r in recs)

    def test_placement_gap_recommends_bridge(self):
        frame = _scored_frame(cgpa=8.5, coding_score=45.0, aptitude_score=44.0)
        row = frame.iloc[0]
        row["data_coverage"] = 100
        row["placement_gap"] = True
        recs = recommendations(row)
        assert any("bridge" in r.lower() or "coding" in r.lower() for r in recs)

    def test_good_student_gets_positive_recommendation(self):
        frame = _scored_frame(cgpa=9.0, attendance_pct=92.0)
        row = frame.iloc[0]
        row["data_coverage"] = 100
        row["placement_gap"] = False
        recs = recommendations(row)
        assert len(recs) > 0

    def test_low_coverage_returns_coverage_warning(self):
        frame = _scored_frame()
        row = frame.iloc[0].copy()
        row["data_coverage"] = 40
        row["missing_indicators"] = ["attendance", "LMS"]
        row["placement_gap"] = False
        recs = recommendations(row)
        assert any("missing" in r.lower() or "complet" in r.lower() for r in recs)
