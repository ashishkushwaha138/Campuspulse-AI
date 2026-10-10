"""Transparent student scoring and synthetic-only model training."""

from __future__ import annotations

import numpy as np
import pandas as pd

try:
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import accuracy_score, precision_score, recall_score, roc_auc_score
    from sklearn.model_selection import train_test_split
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler

    SKLEARN_AVAILABLE = True
except Exception:
    # Windows Application Control may block SciPy's compiled DLLs imported by sklearn.
    # The dashboard can still train with the NumPy fallback below.
    SKLEARN_AVAILABLE = False

from .preprocessing import add_score_components, band_risk, risk_reason


MODEL_FEATURES = ["academic_component", "attendance_component", "lms_component", "skills_component", "placement_component", "backlogs"]
WEIGHTS = {"Academic": 0.35, "Attendance": 0.20, "LMS activity": 0.15, "Skills": 0.15, "Placement readiness": 0.15}


def score_students(frame: pd.DataFrame) -> pd.DataFrame:
    data = add_score_components(frame)
    data["rule_risk"] = data.apply(band_risk, axis=1)
    data["risk_reasons"] = data.apply(risk_reason, axis=1)
    placement_observed = data.loc[~data["placement_missing"]]
    coding_median = placement_observed["coding_score"].median() if len(placement_observed) else float("inf")
    aptitude_median = placement_observed["aptitude_score"].median() if len(placement_observed) else float("inf")
    data["placement_gap"] = (
        (data["cgpa"] > 7.5)
        & ~data["placement_missing"]
        & ((data["coding_score"] < coding_median) | (data["aptitude_score"] < aptitude_median))
    )
    data["placement_ready"] = (
        (data["cgpa"] >= 7.5) & (data["aptitude_score"] >= 70) & (data["coding_score"] >= 65)
        & ~data["placement_missing"]
    )
    return data


def _synthetic_outcome_labels(frame: pd.DataFrame, seed: int = 9182) -> np.ndarray:
    """Create a noisy simulated outcome label for model-demo training only."""
    rng = np.random.default_rng(seed)
    risk_signal = (
        1.7
        - frame["academic_component"].to_numpy() / 35
        - frame["attendance_component"].to_numpy() / 65
        - frame["lms_component"].to_numpy() / 110
        - frame["skills_component"].to_numpy() / 150
        + frame["backlogs"].to_numpy() * 0.62
    )
    probabilities = 1 / (1 + np.exp(-np.clip(risk_signal, -10, 10)))
    return (rng.random(len(frame)) < probabilities).astype(int)


def train_demo_model(scored_frame: pd.DataFrame, seed: int = 42) -> tuple[object, dict, pd.DataFrame]:
    """Train/test split a model on generated labels; never describe as real outcomes."""
    data = scored_frame.dropna(subset=MODEL_FEATURES).copy()
    labels = _synthetic_outcome_labels(data)
    if len(data) < 12 or len(np.unique(labels)) < 2:
        return None, {"accuracy": 0.0, "precision": 0.0, "recall": 0.0, "auc": 0.0, "test_rows": 0}, scored_frame
    if SKLEARN_AVAILABLE:
        x_train, x_test, y_train, y_test = train_test_split(
            data[MODEL_FEATURES], labels, test_size=0.25, random_state=seed, stratify=labels
        )
        model = make_pipeline(StandardScaler(), LogisticRegression(max_iter=500, class_weight="balanced", random_state=seed))
        model.fit(x_train, y_train)
        predicted = model.predict(x_test)
        probabilities = model.predict_proba(x_test)[:, 1]
        full_probabilities = model.predict_proba(data[MODEL_FEATURES])[:, 1]
        metrics = {
            "accuracy": float(accuracy_score(y_test, predicted)),
            "precision": float(precision_score(y_test, predicted, zero_division=0)),
            "recall": float(recall_score(y_test, predicted, zero_division=0)),
            "auc": float(roc_auc_score(y_test, probabilities)) if len(np.unique(y_test)) > 1 else 0.0,
            "test_rows": int(len(y_test)),
            "train_rows": int(len(y_train)),
            "label_source": "simulated synthetic risk outcome",
            "backend": "scikit-learn LogisticRegression",
        }
    else:
        # Standardized batch-gradient logistic regression using NumPy only (no SciPy DLLs).
        matrix = data[MODEL_FEATURES].to_numpy(dtype=float)
        mean = matrix.mean(axis=0)
        scale = matrix.std(axis=0)
        scale[scale == 0] = 1.0
        normalized = (matrix - mean) / scale
        rng = np.random.default_rng(seed)
        indexes = rng.permutation(len(data))
        split = max(1, int(len(data) * 0.75))
        train_idx, test_idx = indexes[:split], indexes[split:]
        if not len(test_idx):
            test_idx = train_idx[-1:]
            train_idx = train_idx[:-1]
        x_train, x_test = normalized[train_idx], normalized[test_idx]
        y_train, y_test = labels[train_idx], labels[test_idx]
        weights = np.zeros(x_train.shape[1], dtype=float)
        bias = 0.0
        positive_weight = len(y_train) / max(2 * int(y_train.sum()), 1)
        negative_weight = len(y_train) / max(2 * int((1 - y_train).sum()), 1)
        sample_weights = np.where(y_train == 1, positive_weight, negative_weight)
        for _ in range(900):
            logits = np.clip(x_train @ weights + bias, -30, 30)
            probabilities_train = 1 / (1 + np.exp(-logits))
            errors = (probabilities_train - y_train) * sample_weights
            weights -= 0.12 * ((x_train.T @ errors) / len(y_train) + 0.001 * weights)
            bias -= 0.12 * float(errors.mean())
        probabilities = 1 / (1 + np.exp(-np.clip(x_test @ weights + bias, -30, 30)))
        predicted = (probabilities >= 0.5).astype(int)
        full_probabilities = 1 / (1 + np.exp(-np.clip(normalized @ weights + bias, -30, 30)))
        tp = int(((predicted == 1) & (y_test == 1)).sum())
        fp = int(((predicted == 1) & (y_test == 0)).sum())
        fn = int(((predicted == 0) & (y_test == 1)).sum())
        positives = int((y_test == 1).sum())
        negatives = int((y_test == 0).sum())
        if positives and negatives:
            order = np.argsort(probabilities)
            ranks = np.empty(len(order), dtype=float)
            ranks[order] = np.arange(1, len(order) + 1)
            auc = float((ranks[y_test == 1].sum() - positives * (positives + 1) / 2) / (positives * negatives))
        else:
            auc = 0.0
        model = {"weights": weights, "bias": bias, "mean": mean, "scale": scale}
        metrics = {
            "accuracy": float((predicted == y_test).mean()),
            "precision": float(tp / max(tp + fp, 1)),
            "recall": float(tp / max(tp + fn, 1)),
            "auc": auc,
            "test_rows": int(len(y_test)),
            "train_rows": int(len(y_train)),
            "label_source": "simulated synthetic risk outcome",
            "backend": "NumPy Logistic Regression fallback (scikit-learn/SciPy DLL blocked)",
        }
    result = scored_frame.copy()
    result["ml_risk_probability"] = full_probabilities
    result["risk_band"] = result["rule_risk"]
    return model, metrics, result
