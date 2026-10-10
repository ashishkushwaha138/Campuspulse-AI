# CampusPulse AI — Success Score and risk methodology

All component indicators are normalized to 0–100. The score is the rounded weighted sum:

```text
Success Score = 0.35 × Academic
              + 0.20 × Attendance
              + 0.15 × LMS activity
              + 0.15 × Skills
              + 0.15 × Placement readiness
```

| Component | Exact calculation | Weight | Why it matters |
|---|---|---:|---|
| Academic | `0.65 × (CGPA / 10 × 100) + 0.35 × mean(internal marks, exam marks)` | 35% | CGPA summarizes performance across terms, while internal and exam marks add recent assessment signals. |
| Attendance | Overall attendance percentage | 20% | Participation is a timely signal that can prompt support before marks fall. |
| LMS activity | `0.35 × min(login_frequency / 24 × 100, 100) + 0.65 × assignment_completion` | 15% | Login frequency reflects platform participation; assignment completion measures follow-through and gets the higher share. |
| Skills | `0.60 × technical_score + 0.40 × soft_skill_score` | 15% | Technical and soft-skill assessments capture distinct readiness dimensions. |
| Placement readiness | `0.45 × aptitude_score + 0.45 × coding_score + 0.10 × min(mock_interviews / 5 × 100, 100)` | 15% | Aptitude and coding are the main assessment signals; interview practice is a smaller preparation indicator. |

### Risk thresholds

- **High:** score below 55, attendance below 65%, or at least two active backlogs.
- **Medium:** not High, and score below 70, attendance below 75%, or LMS component below 45.
- **Low:** none of the preceding rules apply.

The rule-based band drives the overview counts and risk map. Reasons are displayed beside a flag; they are prompts for advisor review, not judgments about ability.

### Model and data limitations

The active React + FastAPI app uses transparent rules for risk flags and K-means for student segmentation. The Copilot summarizes cohort values, score drivers, and intervention playbooks; it does not call an external language model or make autonomous decisions. If Windows blocks scikit-learn/SciPy native DLLs, segmentation uses the NumPy-only implementation. The fictional cohort and its patterns are for demonstration only and do not establish real-world predictive accuracy.

The cohort is fictional. Uploaded missing numeric values are median-imputed where possible and missingness indicators are retained. Validate all source definitions and ranges with the institution. Before a real pilot, use consented outcomes, assess errors across departments and student groups, and monitor whether interventions help. Do not use demo insights for high-stakes decisions.
