from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

import requests
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .rules_engine import DATA_PATH, RULES_PATH, evaluate_rules, load_json

APP_ROOT = Path(__file__).resolve().parents[1]
FHIR_BASE_URL = os.getenv("FHIR_BASE_URL", "https://hapi.fhir.org/baseR4").rstrip("/")
REQUEST_TIMEOUT_SECONDS = float(os.getenv("FHIR_TIMEOUT_SECONDS", "8"))
FHIR_HEADERS = {"Accept": "application/fhir+json, application/json"}

app = FastAPI(
    title="CARE MVP Demo API",
    version="0.1.0",
    description="Synthetic medication-context reconciliation demo with a read-only public FHIR sandbox connector.",
)
# Configure exact browser origins at deploy time. Example:
# CORS_ORIGINS=http://localhost:5173,https://your-care-frontend.vercel.app
_raw_cors_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
)
CORS_ORIGINS = [origin.strip().rstrip("/") for origin in _raw_cors_origins.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["*"],
)


def safe_get_fhir(path: str, params: dict[str, str] | None = None) -> dict[str, Any]:
    url = f"{FHIR_BASE_URL}/{path.lstrip('/')}"
    try:
        response = requests.get(url, params=params, headers=FHIR_HEADERS, timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict):
            raise ValueError("FHIR server returned a non-object JSON response")
        return payload
    except requests.Timeout as exc:
        raise HTTPException(status_code=504, detail="FHIR test server timed out. The local CARE demo remains available.") from exc
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"FHIR test server request failed: {exc.__class__.__name__}. The local CARE demo remains available.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="FHIR test server returned an unreadable response.") from exc


def simplify_patient(resource: dict[str, Any]) -> dict[str, Any]:
    names = resource.get("name") or []
    name = "Unknown name"
    if names:
        chosen = next((item for item in names if item.get("use") == "official"), names[0])
        pieces = chosen.get("text")
        if not pieces:
            given = chosen.get("given") or []
            family = chosen.get("family")
            pieces = " ".join([*given, family] if family else given)
        if pieces:
            name = pieces
    return {
        "resource_type": resource.get("resourceType", "Patient"),
        "id": resource.get("id"),
        "name": name,
        "gender": resource.get("gender", "unknown"),
        "birth_date": resource.get("birthDate"),
    }


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "CARE MVP Demo API", "mode": "synthetic data + read-only FHIR sandbox"}


@app.get("/api/demo/patient")
def get_demo_patient() -> dict[str, Any]:
    data = load_json(DATA_PATH)
    return {
        "demo_mode": True,
        "notice": data.get("notice"),
        "scenario_id": data.get("scenario_id"),
        "scenario_time": data.get("scenario_time"),
        "patient": data.get("patient"),
        "medication_orders": data.get("medication_orders"),
        "laboratory_results": data.get("laboratory_results"),
        "nursing_notes": data.get("nursing_notes"),
        "vital_signs": data.get("vital_signs"),
        "sources": data.get("sources"),
        "source_conflicts": data.get("source_conflicts"),
    }


@app.get("/api/demo/rules")
def get_demo_rules() -> dict[str, Any]:
    # Exposes demo configuration for the UI; edit clinical_rules.json to change thresholds.
    return load_json(RULES_PATH)


@app.get("/api/demo/evaluate")
def run_demo_rules() -> dict[str, Any]:
    return evaluate_rules()


@app.get("/api/integration/fhir/status")
def fhir_status() -> dict[str, Any]:
    metadata = safe_get_fhir("metadata")
    return {
        "connected": True,
        "server_label": "Public HAPI FHIR R4 test server",
        "base_url": FHIR_BASE_URL,
        "fhir_version": metadata.get("fhirVersion", "unknown"),
        "server_name": metadata.get("software", {}).get("name", "FHIR server"),
        "note": "Test/demo environment only. Read-only integration in this prototype; never send real patient information.",
    }


@app.get("/api/integration/fhir/patients")
def search_fhir_patients(
    name: str | None = Query(default=None, max_length=60, description="Optional name filter for the public test server only"),
    count: int = Query(default=5, ge=1, le=10),
) -> dict[str, Any]:
    params = {"_count": str(count), "_elements": "id,name,gender,birthDate"}
    if name and name.strip():
        # Only a search term is sent to the public sandbox. Never pass patient details or free-text notes.
        params["name"] = name.strip()
    bundle = safe_get_fhir("Patient", params=params)
    resources = [entry.get("resource", {}) for entry in bundle.get("entry", []) if entry.get("resource", {}).get("resourceType") == "Patient"]
    return {
        "connected": True,
        "server_label": "Public HAPI FHIR R4 test server",
        "search": {"name": name, "count": count},
        "total": bundle.get("total", len(resources)),
        "patients": [simplify_patient(resource) for resource in resources],
        "note": "Public sandbox results are illustrative test data, may be reset, and must not be used for clinical care.",
    }


@app.get("/api/integration/fhir/patient/{patient_id}")
def get_fhir_patient(patient_id: str) -> dict[str, Any]:
    if not patient_id or len(patient_id) > 64 or not patient_id.replace("-", "").replace("_", "").isalnum():
        raise HTTPException(status_code=400, detail="Invalid FHIR resource id.")
    resource = safe_get_fhir(f"Patient/{patient_id}")
    if resource.get("resourceType") != "Patient":
        raise HTTPException(status_code=502, detail="FHIR endpoint returned a resource that is not a Patient.")
    return {"patient": simplify_patient(resource), "note": "Public test data only; do not use for care."}


@app.get("/api/integration/fhir/example-searches")
def fhir_search_examples() -> dict[str, Any]:
    return {
        "base_url": FHIR_BASE_URL,
        "examples": [
            {"label": "Check server capabilities", "method": "GET", "path": "/metadata"},
            {"label": "Search patients", "method": "GET", "path": "/Patient?_count=5"},
            {"label": "Search patients by test name", "method": "GET", "path": "/Patient?name=Smith&_count=5"},
        ],
        "note": "The prototype uses read-only search requests. HAPI is a public test server, not a hospital production API.",
    }
