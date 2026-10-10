"""Risk segmentation and K-means student profiles."""

from __future__ import annotations

import numpy as np
import pandas as pd

try:
    from sklearn.cluster import KMeans
    from sklearn.preprocessing import StandardScaler

    SKLEARN_CLUSTERING_AVAILABLE = True
except Exception:
    # Some managed Windows machines block SciPy's compiled DLLs. Keep clustering
    # available through the NumPy implementation below in that environment.
    SKLEARN_CLUSTERING_AVAILABLE = False


SEGMENT_FEATURES = ["academic_component", "attendance_component", "lms_component", "placement_component", "skills_component", "engagement_component"]


def assign_segments(frame: pd.DataFrame, seed: int = 24) -> tuple[pd.DataFrame, pd.DataFrame]:
    data = frame.copy()
    if len(data) < 4:
        data["segment"] = "Developing Momentum"
        return data, pd.DataFrame()
    raw = data[SEGMENT_FEATURES].fillna(0).to_numpy(dtype=float)
    if SKLEARN_CLUSTERING_AVAILABLE:
        scaler = StandardScaler()
        matrix = scaler.fit_transform(raw)
        model = KMeans(n_clusters=4, random_state=seed, n_init=15)
        cluster_ids = model.fit_predict(matrix)
        center_values = scaler.inverse_transform(model.cluster_centers_)
    else:
        # Small, deterministic Lloyd K-means implementation using NumPy only.
        # Standardization prevents high-variance components dominating distance.
        mean = raw.mean(axis=0)
        scale = raw.std(axis=0)
        scale[scale == 0] = 1.0
        matrix = (raw - mean) / scale
        rng = np.random.default_rng(seed)
        centers_scaled = matrix[rng.choice(len(matrix), size=4, replace=False)].copy()
        cluster_ids = np.zeros(len(matrix), dtype=int)
        for _ in range(100):
            distances = ((matrix[:, None, :] - centers_scaled[None, :, :]) ** 2).sum(axis=2)
            next_ids = distances.argmin(axis=1)
            next_centers = centers_scaled.copy()
            nearest_distance = distances.min(axis=1)
            for cluster_id in range(4):
                members = matrix[next_ids == cluster_id]
                if len(members):
                    next_centers[cluster_id] = members.mean(axis=0)
                else:
                    # Avoid empty clusters by moving the center to a poorly
                    # represented student profile.
                    next_centers[cluster_id] = matrix[int(nearest_distance.argmax())]
            stable = np.array_equal(next_ids, cluster_ids) and np.allclose(next_centers, centers_scaled)
            cluster_ids = next_ids
            centers_scaled = next_centers
            if stable:
                break
        center_values = centers_scaled * scale + mean
    data["cluster_id"] = cluster_ids
    centers = pd.DataFrame(center_values, columns=SEGMENT_FEATURES)

    # Give each learned centroid one human-readable profile label, selected by its relative signals.
    profiles = centers.copy()
    profiles["placement_gap_strength"] = profiles["academic_component"] - profiles["placement_component"]
    profiles["disengagement_strength"] = 100 - (profiles["attendance_component"] + profiles["lms_component"]) / 2
    profiles["silent_strength"] = profiles["attendance_component"] - profiles["academic_component"]
    labels: dict[int, str] = {}
    remaining = set(centers.index)
    for metric, label in [
        ("disengagement_strength", "Disengaged"),
        ("placement_gap_strength", "Placement Gap"),
        ("silent_strength", "Silent Strugglers"),
        ("academic_component", "High Performers"),
    ]:
        available = profiles.loc[sorted(remaining)]
        selected = int(available[metric].idxmax())
        labels[selected] = label
        remaining.remove(selected)
    data["segment"] = data["cluster_id"].map(labels)
    centers["segment"] = centers.index.map(labels)
    return data, centers.sort_values("segment")


def recommendations(row: pd.Series) -> list[str]:
    suggestions: list[str] = []
    if row["attendance_pct"] < 70:
        suggestions.append("Advisor check-in this week; identify timetable, health, travel, or access barriers.")
    if row["academic_component"] < 55 or row["backlogs"] >= 1:
        suggestions.append("Offer subject-level remedial support and a fortnightly assessment recovery plan.")
    if row["placement_gap"]:
        suggestions.append("Invite to a coding/aptitude bridge cohort and review a mock test in four weeks.")
    if row["lms_component"] < 50:
        suggestions.append("Set a weekly LMS and assignment check-in with a faculty mentor.")
    if row["skills_component"] < 55:
        suggestions.append("Pair with a peer mentor for technical practice and communication feedback.")
    if not suggestions:
        suggestions.append("Recognize progress; offer peer mentoring or an advanced project opportunity.")
    return suggestions


PLAYBOOKS = {
    "Disengaged": ["Advisor outreach within 48 hours", "Check access, wellbeing, timetable, and attendance barriers", "Agree on a weekly LMS and attendance check-in"],
    "Placement Gap": ["Enroll in a coding/aptitude bridge cohort", "Two peer-practice sessions per week", "Review mock-test progress after four weeks"],
    "Silent Strugglers": ["Review subject marks and pending assessments", "Offer remedial tutoring and a short study plan", "Faculty follow-up before the next internal exam"],
    "High Performers": ["Invite to peer mentoring or ambassador opportunities", "Connect to advanced projects and internships", "Capture feedback about what is helping them succeed"],
}
