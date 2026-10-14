import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertCircle, AlertTriangle, ArrowDownRight, ArrowUpRight,
  CheckCircle2, CircleHelp, Clock3, Database, ExternalLink, FileCheck2,
  FlaskConical, HeartPulse, Hospital, Laptop, RefreshCw, Search,
  ShieldAlert, Stethoscope, TabletSmartphone, Wifi, WifiOff
} from 'lucide-react';

const API = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000';

async function fetchJson(path) {
  const response = await fetch(`${API}${path}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || `Request failed (${response.status})`);
  return body;
}

function StatusPill({ status }) {
  const label = status === 'fresh' ? 'Fresh' : status === 'stale' ? 'Stale' : status === 'missing' ? 'Missing' : status;
  return <span className={`pill pill-${status}`}>{label}</span>;
}

function Priority({ level }) {
  return <span className={`priority priority-${String(level).toLowerCase()}`}>{level}</span>;
}

function MetricCard({ icon: Icon, label, value, foot, tone = 'blue' }) {
  return <div className={`metric metric-${tone}`}>
    <span className="metric-icon"><Icon size={18} /></span>
    <div><span className="metric-label">{label}</span><strong>{value}</strong>{foot && <small>{foot}</small>}</div>
  </div>;
}

export default function App() {
  const [caseData, setCaseData] = useState(null);
  const [evaluation, setEvaluation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fhirStatus, setFhirStatus] = useState(null);
  const [fhirError, setFhirError] = useState('');
  const [fhirLoading, setFhirLoading] = useState(false);
  const [searchName, setSearchName] = useState('');
  const [fhirResults, setFhirResults] = useState(null);
  const [showRules, setShowRules] = useState(false);
  const [rules, setRules] = useState(null);

  const loadDemo = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [patient, result] = await Promise.all([
        fetchJson('/api/demo/patient'),
        fetchJson('/api/demo/evaluate'),
      ]);
      setCaseData(patient);
      setEvaluation(result);
    } catch (e) {
      setError(`${e.message}. Start the FastAPI backend and retry.`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDemo(); }, [loadDemo]);

  const runRules = async () => {
    setLoading(true);
    setError('');
    try { setEvaluation(await fetchJson('/api/demo/evaluate')); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const checkFhir = async () => {
    setFhirLoading(true);
    setFhirError('');
    try {
      setFhirStatus(await fetchJson('/api/integration/fhir/status'));
    } catch (e) {
      setFhirStatus(null);
      setFhirError(`${e.message}. The mock CARE scenario still works offline.`);
    } finally { setFhirLoading(false); }
  };

  const searchFhir = async (event) => {
    event?.preventDefault();
    setFhirLoading(true);
    setFhirError('');
    try {
      const term = searchName.trim();
      setFhirResults(await fetchJson(`/api/integration/fhir/patients?count=5${term ? `&name=${encodeURIComponent(term)}` : ''}`));
      setFhirStatus((prev) => prev || { connected: true, server_label: 'Public HAPI FHIR R4 test server' });
    } catch (e) {
      setFhirResults(null);
      setFhirError(`${e.message}. The public test server may be temporarily unavailable.`);
    } finally { setFhirLoading(false); }
  };

  const toggleRules = async () => {
    if (!rules) {
      try { setRules(await fetchJson('/api/demo/rules')); }
      catch (e) { setError(e.message); return; }
    }
    setShowRules((v) => !v);
  };

  const orders = caseData?.medication_orders || [];
  const activeOrder = orders.find((o) => o.medication === 'Heparin');
  const labs = caseData?.laboratory_results?.platelet_trend || [];
  const latestPlatelets = labs[labs.length - 1]?.value;
  const firstPlatelets = labs[0]?.value;
  const plateletDrop = firstPlatelets && latestPlatelets ? Math.round((1 - latestPlatelets / firstPlatelets) * 100) : null;
  const alerts = evaluation?.alerts || [];
  const counts = evaluation?.alert_counts || {};
  const freshness = evaluation?.data_freshness || [];
  const highAlerts = useMemo(() => alerts.filter((a) => a.priority === 'high'), [alerts]);

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand-mark">C</div>
      <div className="brand-text"><strong>CARE</strong><span>Contextual Accuracy Reconciliation Engine</span></div>
      <div className="topbar-spacer" />
      <span className="demo-badge"><span className="status-dot" /> SYNTHETIC DEMO</span>
    </header>

    <main className="page-wrap">
      <section className="intro-row">
        <div>
          <p className="eyebrow">MEDICATION CONTEXT MONITOR</p>
          <h1>Clinical context, connected.</h1>
          <p className="intro-copy">A demo of how CARE combines medication orders, lab results, nursing notes and device status to surface changes for clinician review.</p>
        </div>
        <div className="intro-actions">
          <button className="btn btn-secondary" onClick={loadDemo} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''} /> Reload scenario</button>
          <button className="btn btn-primary" onClick={runRules} disabled={loading}><Activity size={16} /> Run reconciliation</button>
        </div>
      </section>

      {error && <div className="error-banner"><AlertCircle size={18} />{error}</div>}

      <section className="patient-banner">
        <div className="patient-symbol"><Stethoscope size={22} /></div>
        <div className="patient-ident"><span>ACTIVE SYNTHETIC CASE</span><h2>{caseData?.patient?.name || 'Loading demo patient'}</h2><p>{caseData?.patient?.id || 'DEMO-ICU-005'} <span className="bullet">•</span> {caseData?.patient?.unit || 'ICU'} — Bed {caseData?.patient?.bed || '05'} <span className="bullet">•</span> Age {caseData?.patient?.age_years || '—'}</p></div>
        <div className="patient-order"><span>ACTIVE ORDER</span><strong>{activeOrder?.medication || 'Heparin'} · {activeOrder?.dose || '5,000 units'}</strong><small>{activeOrder?.route || 'Subcutaneous'} · Status: {activeOrder?.status || 'active'}</small></div>
        <div className="patient-mode"><ShieldAlert size={15} /> Human review required</div>
      </section>

      <section className="metric-grid">
        <MetricCard icon={FlaskConical} label="Platelets (latest)" value={latestPlatelets ? `${Number(latestPlatelets).toLocaleString('en-US')} /µL` : '—'} foot={plateletDrop !== null ? `${plateletDrop}% decrease in demo trend` : 'Trend not loaded'} tone="red" />
        <MetricCard icon={HeartPulse} label="Heart rate" value={caseData?.vital_signs?.heart_rate_bpm ? `${caseData.vital_signs.heart_rate_bpm} bpm` : '—'} foot={`BP ${caseData?.vital_signs?.systolic_bp_mmhg ?? '—'}/${caseData?.vital_signs?.diastolic_bp_mmhg ?? '—'} mmHg`} tone="amber" />
        <MetricCard icon={AlertTriangle} label="Triggered rules" value={alerts.length} foot={`${counts.high || 0} high · ${counts.medium || 0} medium · ${counts.low || 0} low`} tone="blue" />
        <MetricCard icon={Database} label="Source quality issues" value={freshness.filter((f) => f.status !== 'fresh').length} foot="Stale or missing sources" tone="amber" />
      </section>

      <div className="main-grid">
        <section className="panel sources-panel">
          <div className="panel-heading"><div><span className="section-kicker">01 / INPUTS</span><h3>Hospital data sources</h3></div><span className="panel-icon"><Database size={18} /></span></div>
          <p className="panel-subtitle">A normalized view of the fictional encounter and its input timestamps.</p>
          <div className="source-list">
            {freshness.map((source) => <div className="source-row" key={source.source_key}>
              <div className={`source-icon icon-${source.status}`}>{source.status === 'missing' ? <WifiOff size={17} /> : source.status === 'stale' ? <Clock3 size={17} /> : <CheckCircle2 size={17} />}</div>
              <div className="source-info"><strong>{source.display_name}</strong><span>{source.last_updated ? new Date(source.last_updated).toLocaleString() : 'No timestamp received'}{source.age_minutes !== null ? ` · ${source.age_minutes} min old` : ''}</span></div>
              <StatusPill status={source.status} />
            </div>)}
          </div>
          <div className="note-box"><CircleHelp size={17} /><span>Missing data is not assumed normal. Stale and unavailable sources are shown explicitly.</span></div>
        </section>

        <section className="panel alerts-panel">
          <div className="panel-heading"><div><span className="section-kicker">02 / RECONCILIATION</span><h3>CARE review queue</h3></div><span className="queue-count">{alerts.length} alerts</span></div>
          <p className="panel-subtitle">Rules are read from <code>clinical_rules.json</code> and evaluated against this synthetic case.</p>
          {alerts.length === 0 && <div className="empty-state">Run reconciliation to evaluate the demo scenario.</div>}
          <div className="alert-list">
            {alerts.map((alert) => <article className={`alert-card alert-${alert.priority}`} key={alert.id}>
              <div className="alert-card-head"><div className="alert-symbol">{alert.priority === 'high' ? <AlertTriangle size={18} /> : alert.priority === 'medium' ? <Clock3 size={18} /> : <CircleHelp size={18} />}</div><Priority level={alert.priority} /><span className="rule-id">{alert.id}</span></div>
              <h4>{alert.title}</h4><p>{alert.message}</p>
              {alert.evidence?.length > 0 && <div className="evidence-list"><span>Evidence</span>{alert.evidence.map((item, idx) => <div key={idx}><CheckCircle2 size={13} />{item}</div>)}</div>}
              <div className="alert-footer"><span>Suggested workflow: <b>{alert.action.replaceAll('_', ' ')}</b></span><span>Clinician review</span></div>
            </article>)}
          </div>
          <div className="safety-note"><ShieldAlert size={17} /><span>CARE flags evidence for a human to review. This demo does not make medication changes.</span></div>
        </section>
      </div>

      <section className="panel integration-panel">
        <div className="panel-heading"><div><span className="section-kicker">03 / EXTERNAL CONNECTIVITY</span><h3>External FHIR integration</h3></div><span className="panel-icon"><ExternalLink size={18} /></span></div>
        <p className="panel-subtitle">The backend calls a public FHIR R4 test server. This is a connectivity demonstration, not a production hospital connection.</p>
        <div className="integration-actions">
          <button className="btn btn-primary" onClick={checkFhir} disabled={fhirLoading}><Wifi size={16} /> {fhirLoading ? 'Checking…' : 'Check FHIR connection'}</button>
          <form className="search-form" onSubmit={searchFhir}><label htmlFor="fhir-name">Optional test-name filter</label><div><input id="fhir-name" value={searchName} onChange={(e) => setSearchName(e.target.value)} placeholder="Leave blank to list sample records" maxLength={60} /><button className="btn btn-secondary" type="submit" disabled={fhirLoading}><Search size={15} /> Search</button></div></form>
        </div>
        {fhirError && <div className="error-banner compact"><AlertCircle size={17} />{fhirError}</div>}
        {fhirStatus && <div className="fhir-status"><CheckCircle2 size={18} /><div><strong>{fhirStatus.server_label || 'FHIR sandbox'} connected</strong><span>{fhirStatus.base_url || 'https://hapi.fhir.org/baseR4'} · FHIR version {fhirStatus.fhir_version || 'R4'}</span></div><span className="pill pill-fresh">Connected</span></div>}
        {fhirResults && <div className="fhir-results"><div className="results-heading"><strong>FHIR Patient search result</strong><span>{fhirResults.total ?? fhirResults.patients?.length ?? 0} matching resources</span></div>
          {fhirResults.patients?.length ? <div className="fhir-table-wrap"><table><thead><tr><th>Resource</th><th>FHIR ID</th><th>Display name</th><th>Gender</th><th>Birth date</th></tr></thead><tbody>{fhirResults.patients.map((p) => <tr key={p.id}><td><span className="resource-tag">Patient</span></td><td><code>{p.id}</code></td><td>{p.name}</td><td>{p.gender}</td><td>{p.birth_date || '—'}</td></tr>)}</tbody></table></div> : <div className="empty-state small">No matching Patient resources were returned. Try a different test search or leave the search blank.</div>}
          <p className="tiny-note">Results come from a public test environment; they may change or be reset. Never use these records for clinical care.</p>
        </div>}
        {!fhirStatus && !fhirResults && !fhirError && <div className="integration-placeholder"><Hospital size={22} /><span>Connection not checked yet</span><small>Click “Check FHIR connection” to call the server's <code>/metadata</code> endpoint.</small></div>}
      </section>

      <section className="bottom-grid">
        <div className="panel compact-panel"><div className="panel-heading"><div><span className="section-kicker">CONFIGURATION</span><h3>Clinical rule file</h3></div><FileCheck2 size={19} className="muted-icon" /></div><p className="panel-subtitle">Tune demo thresholds and alert wording in JSON without editing the UI.</p><button className="text-button" onClick={toggleRules}>{showRules ? 'Hide' : 'Preview'} clinical_rules.json <span>→</span></button>
          {showRules && rules && <pre className="json-preview">{JSON.stringify(rules, null, 2)}</pre>}
        </div>
        <div className="panel compact-panel"><div className="panel-heading"><div><span className="section-kicker">PROTOTYPE BOUNDARIES</span><h3>What this demo proves</h3></div><Laptop size={19} className="muted-icon" /></div><div className="boundary-list"><p><CheckCircle2 size={15} /> Mock data ingestion and reconciliation</p><p><CheckCircle2 size={15} /> JSON-configured rule evaluation</p><p><CheckCircle2 size={15} /> Public FHIR read/search connectivity</p><p><AlertTriangle size={15} /> Not authenticated to a real hospital EHR</p></div></div>
      </section>

      <footer className="footer-note">CARE MVP prototype · Synthetic clinical scenario · Educational demonstration only, not for clinical use.</footer>
    </main>
  </div>;
}
