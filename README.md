# CARE MVP Demo — Mock ICU Data + External FHIR Integration

This is a small, demo-ready prototype for **CARE — Contextual Accuracy Reconciliation Engine**.

It demonstrates two separate workflows:

1. **Synthetic CARE scenario:** a fictional ICU patient, active medication orders, platelet trend, nursing note, vital signs, source freshness, rules, and prioritized alerts.
2. **External API integration:** the FastAPI backend reads metadata and searches Patient resources from the public HAPI FHIR R4 test server.

> **Safety boundary:** all included patient details and results are fictional demonstration data. The JSON rules are illustrative prototype heuristics, not clinically validated decision rules. This is not for patient care. The app does not prescribe, stop, hold, or modify medication automatically. Do not upload real patient information to public test servers.

## 1. Folder layout

```text
care-mvp-demo/
├── README.md
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   └── rules_engine.py
│   ├── data/
│   │   └── mock_hospital_data.json
│   ├── rules/
│   │   └── clinical_rules.json
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── package.json
    ├── index.html
    └── src/
        ├── App.jsx
        ├── main.jsx
        └── styles.css
```

## 2. Run the backend (Windows)

Open a terminal in the `backend` folder.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
uvicorn app.main:app --reload
```

If PowerShell blocks activation, use Command Prompt instead:

```bat
.venv\Scripts\activate.bat
```

The API will be available at:

- API root/docs: <http://127.0.0.1:8000/docs>
- Health check: <http://127.0.0.1:8000/api/health>
- Synthetic patient: <http://127.0.0.1:8000/api/demo/patient>
- Evaluate rules: <http://127.0.0.1:8000/api/demo/evaluate>
- FHIR connection check: <http://127.0.0.1:8000/api/integration/fhir/status>
- FHIR Patient search: <http://127.0.0.1:8000/api/integration/fhir/patients>

The synthetic scenario works locally even if the external FHIR sandbox is unavailable.

## 3. Run the frontend

Open a second terminal in the `frontend` folder.

```powershell
npm install
npm run dev
```

Open the URL printed by Vite, normally <http://localhost:5173>.

The UI starts with the synthetic ICU scenario. Click **Run reconciliation** to evaluate the JSON rules. Under **External FHIR integration**, click **Check FHIR connection** and optionally search for test Patient resources.

If your backend is hosted somewhere other than `http://127.0.0.1:8000`, create `frontend/.env.local` with:

```text
VITE_API_BASE=http://127.0.0.1:8000
```

Restart Vite after changing environment variables.

## 4. How the external API integration works

This prototype uses the public HAPI FHIR R4 test endpoint:

```text
https://hapi.fhir.org/baseR4
```

Relevant routes in this project:

- `GET /api/integration/fhir/status` → backend calls external `/metadata` and reads the advertised FHIR version.
- `GET /api/integration/fhir/patients` → backend calls external `/Patient?_count=5`.
- `GET /api/integration/fhir/patients?name=Smith` → backend uses a FHIR Patient name search.
- `GET /api/integration/fhir/patient/{id}` → backend reads one resource by FHIR ID.

The browser calls **your FastAPI backend**, and FastAPI calls HAPI. This avoids depending on browser-to-server CORS behavior and keeps integration logic in one place. The current connector is read-only.

Quick command-line checks:

```bash
curl http://127.0.0.1:8000/api/integration/fhir/status
curl "http://127.0.0.1:8000/api/integration/fhir/patients?count=5"
curl "http://127.0.0.1:8000/api/integration/fhir/patients?name=Smith&count=5"
```

HAPI is a **public test/demo server, not an actual hospital API**. Its test records can be reset or changed. For a real hospital, you would need the hospital's approved FHIR endpoint, authentication method, permissions, patient-consent/access workflow, and an integration agreement. Do not assume an actual hospital exposes the same endpoint openly.

You can change the endpoint with an environment variable when you have an authorized test endpoint:

```powershell
$env:FHIR_BASE_URL="https://hapi.fhir.org/baseR4"
uvicorn app.main:app --reload
```

Never enter private patient data into search fields while using a public sandbox. Do not POST data to the public HAPI server for this demo.

## 5. How the mock hospital data is structured

Edit `backend/data/mock_hospital_data.json` to change the demo case. The file currently contains:

- A fictional patient and ICU encounter
- Active Heparin and Furosemide orders
- A platelet trend from `220000` to `78000 /µL`
- A fictional nursing note: `Bleeding observed at IV site`
- Example vital signs
- Per-source last-update times and freshness windows
- A missing infusion-pump telemetry example
- A separate medication-status conflict example (EMR says `active`; a mock reconciliation feed says `discontinued`)

The case timeline is fixed to `2026-10-14T12:00:00+05:30` so the demo is repeatable. The “age in minutes” shown by the app is calculated from that scenario clock, not your computer's current clock. Clinical event records now explicitly include the same `patient_id` and `encounter_id` to support identity/encounter-validation demonstrations. Platelet units use `/µL`, matching the dashboard display. The baseline reconciliation output is 5 alerts (2 high, 3 medium, 0 low) and 2 stale/missing sources; this expected result is preserved by the current JSON data and rules.

## 6. How the JSON clinical rules work

Edit `backend/rules/clinical_rules.json`. Each enabled rule has an `id`, `type`, `priority`, trigger configuration, display message, and workflow action label.

Currently supported `type` values:

- `anticoagulant_context_combo` — looks for an active anticoagulant, matching bleeding-related note wording, and a platelet decline at or above a configured percentage.
- `source_staleness` — flags a source whose age is greater than the configured freshness window.
- `source_missing` — flags a source unavailable or without a usable timestamp.
- `vital_threshold` — applies configured example thresholds to the demo heart rate and systolic blood pressure.
- `source_conflict` — flags source records whose status is `conflict`.

The Python evaluator in `backend/app/rules_engine.py` interprets those rule types. JSON controls the thresholds and messages; new rule types require a corresponding evaluator branch in Python.

### Modify a threshold

For example, to change the demo platelet decline trigger, edit:

```json
"platelet_drop_percent_at_least": 50
```

to another threshold. Save the file and click **Run reconciliation**. No frontend change is needed for rule thresholds or alert wording.

The freshness thresholds in `clinical_rules.json` and the per-source `stale_after_minutes` values in `mock_hospital_data.json` should be kept aligned. In this MVP, the stale-coagulation rule has a configured 240-minute threshold, and the source record is 360 minutes old in the fixed scenario.

## 7. Demo walkthrough (about 2 minutes)

1. Open the dashboard and point out the banner **SYNTHETIC DEMO**.
2. Show the active Heparin order beside the latest platelet value.
3. Click **Run reconciliation**.
4. Explain the high-priority contextual alert: platelet decline + bleeding note + active anticoagulant order. It is a prompt for clinical review, not an autonomous treatment decision.
5. Show **Stale** coagulation data and **Missing** infusion-pump telemetry. Emphasize that missing or stale information is not treated as normal.
6. Show the Furosemide source-conflict rule, explaining that the two source values are preserved and need reconciliation.
7. Click **Check FHIR connection**. Then search Patient resources from the public FHIR sandbox to demonstrate external connectivity.
8. Explain the boundary: the public FHIR sandbox proves the API integration pattern; it does not mean the prototype is already connected to a real hospital EHR.

## 8. Important production gaps

This is deliberately a prototype. A real deployment would additionally need hospital-approved authentication and authorization, audit logging, identity matching, data provenance, resilient retries/queues, validation against local clinical governance, clinician testing, security/privacy review, and integration with the specific hospital's systems. Do not use these example thresholds or rules for clinical care.

## 9. Deploy the demo (Vercel + Render)

This repository contains a React/Vite frontend in `frontend/` and a FastAPI backend in `backend/`. The current demo reads its patient scenario and rule configuration from JSON files; it does not require a database.

### A. Push the project to GitHub

1. Extract `care-mvp-demo.zip`.
2. Create an empty GitHub repository named `care-mvp-demo` (do not add a README or license on GitHub).
3. Open a terminal in the extracted `care-mvp-demo` folder and run:

```bash
git init
git add .
git commit -m "Prepare CARE MVP demo deployment"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/care-mvp-demo.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username. Do not commit `.env` files or secrets.

### B. Deploy the backend on Render

1. In Render, create **New → Web Service** and connect the GitHub repository.
2. Set **Root Directory** to `backend`.
3. Set **Build Command** to `pip install -r requirements.txt`.
4. Set **Start Command** to `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
5. Add environment variables:
   - `FHIR_BASE_URL` = `https://hapi.fhir.org/baseR4`
   - `FHIR_TIMEOUT_SECONDS` = `8`
   - `CORS_ORIGINS` = `http://localhost:5173,http://127.0.0.1:5173` (update this after Vercel gives you the frontend URL).
6. Deploy. Copy the Render URL, for example `https://care-mvp-api.onrender.com`.
7. Test `https://YOUR-RENDER-URL/api/health` and `https://YOUR-RENDER-URL/api/demo/evaluate`. They should return JSON.

### C. Deploy the frontend on Vercel

1. In Vercel, choose **Add New → Project** and import the same GitHub repository.
2. Set **Root Directory** to `frontend`.
3. Use the Vite framework preset. Build command: `npm run build`; output directory: `dist`.
4. Add environment variable `VITE_API_BASE` = your complete Render backend URL, including `https://` and without a trailing slash. Example: `https://care-mvp-api.onrender.com`. Vite exposes variables prefixed with `VITE_` to the browser, so never place secrets in them.
5. Deploy and copy the Vercel URL, for example `https://care-mvp-demo.vercel.app`.

### D. Allow the deployed frontend in backend CORS

Return to Render → your backend service → Environment. Update `CORS_ORIGINS` to a comma-separated list of the exact frontend origins, including the Vercel URL with no trailing slash. Example:

```text
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,https://care-mvp-demo.vercel.app
```

Save/redeploy the backend. If you use a Vercel preview URL, add that exact origin only if you need to use that preview. The API intentionally uses a list of allowed origins rather than a permissive wildcard.

### E. Final checks

- Open `https://YOUR-RENDER-URL/api/health` and verify `status: ok`.
- Open your Vercel site; confirm the synthetic patient and alerts load.
- Click **Run reconciliation** and confirm the dashboard evaluates the local JSON rules.
- Click **Check FHIR connection**. If the public test server is unavailable, the local synthetic scenario should still work.
- Search only public test data in HAPI. Never send real patient details to its public test server.

### Deployment notes

- Render's free services may spin down after inactivity; the first request after a quiet period can take longer.
- The public HAPI FHIR server is only a connectivity demonstration, not a production hospital connection.
- This prototype uses synthetic JSON files and illustrative rule thresholds; it is not for clinical use.
