# CampusPulse AI — Student Success Platform

CampusPulse AI joins academic, attendance, LMS, engagement, placement, skills, and feedback signals into a student-level view. It helps campus teams identify students who may need support, understand the drivers, and assign an actionable intervention.

The premium web application uses **React + Vite + Tailwind CSS + Recharts** for the frontend and **Python + FastAPI + Pandas + scikit-learn/NumPy** for the API and analytics.

## What is included

- Overview KPIs, semester success trend, risk distribution, department pulse, watchlist, and recent intervention feed.
- Searchable student directory with department/risk filters, placement-gap badges, six-factor radar profiles, explainable risk reasons, and intervention assignment.
- Risk analysis, placement readiness, four student segments, intervention playbooks, and cohort insights.
- A cohort-grounded AI Copilot that answers questions about individual students, risk drivers, attendance, segments, placement gaps, and the Success Score. It runs against local analytics without an external AI key and labels demo versus live cohort responses.
- Synthetic source tables for 500 fictional students over six semesters; the backend joins these sources by `student_id` and `semester`.
- CSV upload endpoint for campus source exports and CSV student report export.
- Interventions saved to `data/interventions.json` by the API, or to this browser's `localStorage` in offline demo mode.
- A NumPy-only K-means fallback if Windows blocks scikit-learn/SciPy native DLLs.

## Step 1 — Install prerequisites

Install **Node.js 20 or newer** and **Python 3.11 or newer**. Open PowerShell in this project directory. The React frontend and API run in two separate terminals.

## Step 2 — Install the API dependencies

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

If Python is already installed under a different launcher, replace `py -3.12` with the Python command available on your computer. If your existing `.venv` is usable, skip the first line.

## Step 3 — Start the FastAPI backend

In **Terminal 1**, from the project root:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

The API is at `http://localhost:8000`; its interactive API reference is `http://localhost:8000/docs`. On first startup, it creates a reproducible synthetic cohort in memory from the source definitions in `src/data_loader.py`.

## Step 4 — Install and start the frontend

In **Terminal 2**:

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

Open the Vite URL shown in the terminal, normally `http://localhost:5173`. Keep both terminal windows open while using the live app. To stop either service, focus its terminal and press **Ctrl+C**.

For later launches, run `run_backend.bat` from the project folder and `run_frontend.bat` after installing frontend packages. The front-end and Copilot also render the synthetic demo cohort if the API is not running; intervention actions then persist in the browser's local storage. CSV imports require the API.

## Data integration

The generated cohort has six semester records per student. Recommended source files share `student_id`; semester-level files also share `semester`.

| Source table | Example columns |
|---|---|
| `students.csv` | `student_id`, `name`, `department`, `year`, `semester` |
| `academic.csv` | `student_id`, `semester`, `cgpa`, `internal_marks`, `exam_marks`, `backlogs` |
| `attendance.csv` | `student_id`, `semester`, `attendance_pct` |
| `lms.csv` | `student_id`, `semester`, `login_frequency`, `assignment_completion` |
| `engagement.csv` | `student_id`, `semester`, `events`, `certifications`, `hackathons` |
| `placement.csv` | `student_id`, `semester`, `aptitude_score`, `coding_score`, `mock_interviews` |
| `skills.csv` | `student_id`, `semester`, `technical_score`, `soft_skill_score` |
| `feedback.csv` | `student_id`, `semester`, `satisfaction_score`, `faculty_feedback_score` |

Use **Import data** in the app to select one or more CSV files. The source loader integrates records on the shared keys and applies the same scoring workflow. The API keeps imported data in memory for the current run; restart returns to the generated demo cohort. Confirm column definitions, student consent, and data access policies before using real campus records.

## Student Success Score

All five indicators are normalized to 0–100 and combined as:

```text
Success Score = 0.35 × Academic
              + 0.20 × Attendance
              + 0.15 × LMS activity
              + 0.15 × Skills
              + 0.15 × Placement readiness
```

- **Academic (35%)** = 65% CGPA normalized from a 0–10 scale + 35% average of internal and exam marks.
- **Attendance (20%)** = reported attendance percentage.
- **LMS activity (15%)** = 65% assignment completion + 35% logins normalized to 24 per term.
- **Skills (15%)** = 60% technical assessment + 40% soft-skill assessment.
- **Placement readiness (15%)** = 45% aptitude + 45% coding + 10% mock interviews normalized to five per term.

High risk is flagged below 55 score, below 65% attendance, or at two or more active backlogs. Medium risk is flagged below 70 score, below 75% attendance, or below 45 LMS component if no High rule applies. The placement-gap badge means CGPA above 7.5 and either coding or aptitude below the cohort median. The full notes and rationale are in [score-methodology.md](score-methodology.md).

## Modeling and responsible use

Risk flags use transparent attendance, backlog, LMS, and Success Score rules. K-means groups standardized academic, attendance, LMS, placement, skills, and engagement components into four profiles: High Performers, Silent Strugglers, Placement Gap, and Disengaged. Scikit-learn is used when available; a NumPy implementation keeps segmentation functional if Windows blocks SciPy's compiled DLLs. The Copilot answers from the active cohort and documented rules; it does not call an external LLM or make autonomous decisions.

Interventions are prompts for supportive faculty review, not automated decisions. Validate any pilot with consented outcomes, check errors across groups, and evaluate whether assigned support improves student outcomes.

## API quick reference

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Service readiness |
| `GET /api/overview` | KPIs, score trends, risk bands, departments, and recent actions |
| `GET /api/students` | Searchable/filterable student profiles |
| `GET /api/students/{student_id}` | Student history, score components, reasons, and recommendations |
| `GET /api/segments` | Four cluster sizes and intervention playbooks |
| `GET /api/placement` | Skill medians, placement flags, and readiness bands |
| `GET /api/insights` | Admin-actionable cohort patterns |
| `POST /api/chat` | Answer admin questions from the current cohort and score rules |
| `POST /api/interventions` | Assign and persist an intervention |
| `POST /api/import` | Integrate uploaded CSV source tables |

## Repository map

```text
frontend/src/             React views, AI Copilot, and visual system
backend/main.py           FastAPI analytics, chat, import, and intervention APIs
backend/requirements.txt  API dependencies
src/                      Data generation, score logic, risk and segments
data/                     Generated CSV sources and action persistence
```

## Deploy to Render

The repository includes a Render Blueprint in `render.yaml`. It creates two connected services: a FastAPI API and a React static site. The Blueprint wires the API URL into the frontend build and allows requests from the deployed site.

1. Push the latest project changes to the GitHub `main` branch.
2. Sign in at [Render](https://render.com/) and choose **New +** → **Blueprint**.
3. Connect `ashishkushwaha138/Campuspulse-AI` and select the `main` branch.
4. Review the two services (`campuspulse-api` and `campuspulse-frontend`), choose the Free plan for the API, then create/apply the Blueprint.
5. Wait for both deploys to finish. Open the frontend service's `onrender.com` URL. Check the API at `<API URL>/api/health` if the page does not load cohort data.

The free API may take about a minute to wake after 15 minutes without traffic. Free services have an ephemeral filesystem, so assigned interventions written to `data/interventions.json` can be lost after a restart, spin-down, or redeploy. CSV uploads are held in memory and also reset when the API restarts. Use a persistent database before relying on intervention history for real users.
