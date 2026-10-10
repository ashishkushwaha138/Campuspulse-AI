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

- **High:** with at least 80% source coverage, Success Score below 55; or an observed attendance value below 65%; or at least two observed active backlogs.
- **Medium:** not High, and with at least 80% source coverage Success Score below 70; or observed attendance below 75%; or an observed LMS component below 45.
- **Low:** none of the preceding rules apply.

The rule-based band drives the overview counts and risk map. Reasons are displayed beside a flag; they are prompts for advisor review, not judgments about ability. Each of the six indicator groups (Academic, Attendance, LMS, Skills, Placement, Engagement) is tracked for data coverage. A missing field is median-imputed if cohort values exist; if an entire field is absent, a neutral midpoint is used (CGPA 5/10, percentage scores 50/100, 12 LMS logins per term, 2.5 mock interviews, event counts 2/2/1, ratings 3.5/5, and zero backlogs). Missingness remains flagged, its component is excluded from direct risk triggers, and the dashboard warns when records are incomplete. Score-based bands require at least 80% coverage. Values beyond valid scales are clipped and counted in the data-quality warning.

### Model and data limitations

The active React + FastAPI app uses transparent rules for risk flags and K-means for student segmentation. K-means centroids are matched to four documented profile prototypes so a relatively strongest low-performing cluster is not mislabeled as High Performers. The Copilot summarizes cohort values, score drivers, and intervention playbooks; it does not call an external language model or make autonomous decisions. If Windows blocks scikit-learn/SciPy native DLLs, segmentation uses the NumPy-only implementation. The fictional cohort and its patterns are for demonstration only and do not establish real-world predictive accuracy. No supervised early-warning model is trained from synthetic outcome labels.

The cohort is fictional. Uploaded data is held in API memory and resets when the service restarts. Validate source definitions and ranges with the institution. Before a real pilot, use consented outcome labels, assess errors across departments and student groups, and monitor whether interventions help. Do not use demo insights for high-stakes decisions. The current public Render deployment has no administrator authentication; use synthetic data only until authentication, authorization, and persistent storage are added and reviewed.
