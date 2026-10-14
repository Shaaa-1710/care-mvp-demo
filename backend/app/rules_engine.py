"""Small configurable rules engine for fictional CARE MVP scenarios only."""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "mock_hospital_data.json"
RULES_PATH = ROOT / "rules" / "clinical_rules.json"


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def minutes_old(now: datetime, updated: str | None) -> int | None:
    stamp = parse_dt(updated)
    if stamp is None:
        return None
    try:
        return max(0, int((now - stamp).total_seconds() / 60))
    except TypeError:
        return None


def build_freshness(data: dict[str, Any]) -> list[dict[str, Any]]:
    now = parse_dt(data.get("scenario_time")) or datetime.now().astimezone()
    results: list[dict[str, Any]] = []
    for source in data.get("sources", []):
        age = minutes_old(now, source.get("last_updated"))
        if not source.get("available") or age is None:
            status = "missing"
        elif age > int(source.get("stale_after_minutes", 0)):
            status = "stale"
        else:
            status = "fresh"
        results.append({
            "source_key": source.get("source_key"),
            "display_name": source.get("display_name"),
            "last_updated": source.get("last_updated"),
            "age_minutes": age,
            "stale_after_minutes": source.get("stale_after_minutes"),
            "status": status,
        })
    return results


def evaluate_rules(data: dict[str, Any] | None = None, rules_doc: dict[str, Any] | None = None) -> dict[str, Any]:
    data = data or load_json(DATA_PATH)
    rules_doc = rules_doc or load_json(RULES_PATH)
    freshness = build_freshness(data)
    freshness_by_key = {row["source_key"]: row for row in freshness}
    now = parse_dt(data.get("scenario_time")) or datetime.now().astimezone()
    fired: list[dict[str, Any]] = []

    orders = data.get("medication_orders", [])
    active_anticoagulants = [
        order for order in orders
        if str(order.get("status", "")).lower() in ["active", "on-hold"]
        and str(order.get("medication_class", "")).lower() in ["anticoagulant"]
    ]
    trend = data.get("laboratory_results", {}).get("platelet_trend", [])
    platelet_drop_percent = None
    if len(trend) >= 2 and float(trend[0].get("value", 0) or 0) > 0:
        initial = float(trend[0]["value"])
        latest = float(trend[-1]["value"])
        platelet_drop_percent = round(max(0.0, (initial - latest) / initial * 100), 1)

    note_text = " ".join(note.get("text", "") for note in data.get("nursing_notes", [])).lower()
    vitals = data.get("vital_signs", {})

    for rule in rules_doc.get("rules", []):
        if not rule.get("enabled", True):
            continue
        kind = rule.get("type")
        evidence: list[str] = []
        triggered = False
        extra: dict[str, Any] = {}

        if kind == "anticoagulant_context_combo":
            has_keyword = any(keyword.lower() in note_text for keyword in rule.get("note_keywords_any", []))
            has_anticoagulant = any(
                str(order.get("medication_class", "")).lower() in rule.get("medication_classes_any", [])
                and str(order.get("status", "")).lower() in rule.get("active_statuses", [])
                for order in orders
            )
            drop_threshold = float(rule.get("platelet_drop_percent_at_least", 0))
            has_drop = platelet_drop_percent is not None and platelet_drop_percent >= drop_threshold
            triggered = has_keyword and has_anticoagulant and has_drop
            if has_drop and trend:
                evidence.append(f"Platelets decreased from {int(trend[0]['value']):,} to {int(trend[-1]['value']):,}/µL ({platelet_drop_percent}% decrease)")
            if has_keyword:
                evidence.append("Nursing note documents possible bleeding")
            if has_anticoagulant:
                meds = ", ".join(order["medication"] for order in active_anticoagulants)
                evidence.append(f"Active anticoagulant order: {meds}")
            extra["platelet_drop_percent"] = platelet_drop_percent
        elif kind == "source_staleness":
            source = freshness_by_key.get(rule.get("source_key"), {})
            triggered = source.get("status") == "stale"
            if triggered:
                evidence.append(f"{source.get('display_name')} last updated {source.get('age_minutes')} minutes ago")
        elif kind == "source_missing":
            source = freshness_by_key.get(rule.get("source_key"), {})
            triggered = source.get("status") == "missing"
            if triggered:
                evidence.append(f"No current data received from {source.get('display_name')}")
        elif kind == "vital_threshold":
            sbp = vitals.get("systolic_bp_mmhg")
            hr = vitals.get("heart_rate_bpm")
            sbp_hit = sbp is not None and sbp < float(rule.get("systolic_bp_below_mmhg", -1))
            hr_hit = hr is not None and hr > float(rule.get("heart_rate_above_bpm", 10**9))
            if rule.get("logic", "any") == "all":
                triggered = sbp_hit and hr_hit
            else:
                triggered = sbp_hit or hr_hit
            if sbp_hit:
                evidence.append(f"Systolic blood pressure: {sbp} mmHg (demo review threshold crossed)")
            if hr_hit:
                evidence.append(f"Heart rate: {hr} bpm (demo review threshold crossed)")
        elif kind == "source_conflict":
            conflicts = [item for item in data.get("source_conflicts", []) if item.get("status") == "conflict"]
            triggered = bool(conflicts)
            for conflict in conflicts:
                evidence.append(
                    f"{conflict.get('subject')}: {conflict.get('source_a')}={conflict.get('value_a')} vs "
                    f"{conflict.get('source_b')}={conflict.get('value_b')}"
                )
        else:
            # Unknown rule types are ignored rather than interpreted unpredictably.
            continue

        if triggered:
            fired.append({
                "id": rule.get("id"),
                "name": rule.get("name"),
                "priority": rule.get("priority", "low"),
                "title": rule.get("title", rule.get("name", "CARE rule triggered")),
                "message": rule.get("message", "Review required."),
                "action": rule.get("action", "review_required"),
                "evidence": evidence,
                **extra,
            })

    rank = {"high": 0, "medium": 1, "low": 2, "info": 3}
    fired.sort(key=lambda item: rank.get(item["priority"], 99))
    counts = {level: sum(1 for item in fired if item["priority"] == level) for level in ("high", "medium", "low", "info")}
    return {
        "demo_mode": True,
        "scenario_id": data.get("scenario_id"),
        "scenario_time": data.get("scenario_time"),
        "notice": "Synthetic demo output only. Not a medical device or a clinically validated decision-support system.",
        "data_freshness": freshness,
        "alerts": fired,
        "alert_counts": counts,
        "rules_version": rules_doc.get("rules_version", "unknown"),
        "human_review_required": bool(rules_doc.get("safety", {}).get("requires_human_review", True)),
        "autonomous_medication_changes": bool(rules_doc.get("safety", {}).get("autonomous_medication_changes", False)),
    }
