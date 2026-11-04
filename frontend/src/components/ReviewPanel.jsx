// components/ReviewPanel.jsx — Side-by-side: document viewer (left) + cardwise editable form (right)
import { useState } from 'react';
import { X, Building2, BookOpen, DollarSign, Calendar, AlertTriangle, Check, XCircle, RotateCcw } from 'lucide-react';
import { approveDoc, rejectDoc, reprocessDoc } from '../services/client';

// ─── helpers ─────────────────────────────────────────────────────────────────
function safe(val) { return val == null ? '' : String(val); }
function num(val)  { return val == null ? '' : String(val); }

// Editable text field
function Field({ label, value, onChange, type = 'text', full = false, options = null }) {
  return (
    <div className={`field-item ${full ? 'full' : ''}`}>
      <label>{label}</label>
      {options ? (
        <select value={safe(value)} onChange={e => onChange(e.target.value || null)}>
          <option value="">— null —</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type} value={safe(value)} onChange={e => onChange(e.target.value || null)} autoComplete="off" />
      )}
    </div>
  );
}

// ─── Deep-set helper for nested state ────────────────────────────────────────
function setPath(obj, path, value) {
  const parts = path.split('.');
  const result = JSON.parse(JSON.stringify(obj));
  let cur = result;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
  return result;
}

// ─── Info section wrapper ─────────────────────────────────────────────────────
function Section({ icon, iconClass, title, children }) {
  return (
    <div className="info-section">
      <div className="info-card">
        <div className="info-card-header">
          <div className={`info-card-header-icon ${iconClass}`}>{icon}</div>
          <h3>{title}</h3>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Document preview (left pane) ─────────────────────────────────────────────
function DocPreview({ doc }) {
  const ext = (doc.filename || '').split('.').pop().toLowerCase();
  const fileUrl = `${import.meta.env.VITE_API_URL || 'https://55q20zc7kj.execute-api.us-west-2.amazonaws.com/prod'}/documents/${doc.document_id}/file`;

  if (['pdf'].includes(ext)) {
    return (
      <iframe title="document-preview" src={`${fileUrl}`}
        style={{ width: '100%', height: '100%', border: 'none', minHeight: 500 }} />
    );
  }
  if (['png', 'jpg', 'jpeg', 'tiff'].includes(ext)) {
    return <img src={fileUrl} alt="document" style={{ maxWidth: '100%', borderRadius: 8 }} />;
  }
  // Fallback: show raw text
  return (
    <div style={{ background: 'var(--surface-alt)', borderRadius: 8, padding: 16, fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap', overflowY: 'auto', maxHeight: 500 }}>
      {doc.raw_text || 'No raw text available for preview.'}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────
export default function ReviewPanel({ doc, onClose, onAction }) {
  const initial = typeof doc.extracted_json === 'string'
    ? (() => { try { return JSON.parse(doc.extracted_json); } catch { return {}; } })()
    : (doc.extracted_json || {});

  const [data, setData] = useState(initial);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  function set(path, value) { setData(d => setPath(d, path, value)); }

  function showToast(msg, type = 'info') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleApprove() {
    setSaving(true);
    try {
      await approveDoc(doc.document_id, data);
      showToast('Document approved and saved to production!', 'success');
      setTimeout(() => { onClose(); onAction && onAction(); }, 1200);
    } catch (e) {
      showToast(e?.response?.data?.detail || 'Approval failed', 'error');
    } finally { setSaving(false); }
  }

  async function handleReject() {
    if (!rejectReason.trim()) { showToast('Please enter a rejection reason', 'error'); return; }
    setSaving(true);
    try {
      await rejectDoc(doc.document_id, rejectReason);
      showToast('Document rejected.', 'info');
      setTimeout(() => { onClose(); onAction && onAction(); }, 1000);
    } catch (e) {
      showToast(e?.response?.data?.detail || 'Rejection failed', 'error');
    } finally { setSaving(false); }
  }

  async function handleReprocess() {
    setSaving(true);
    try {
      await reprocessDoc(doc.document_id);
      showToast('Reprocessing started…', 'info');
      setTimeout(() => { onClose(); onAction && onAction(); }, 800);
    } catch (e) {
      showToast(e?.response?.data?.detail || 'Reprocess failed', 'error');
    } finally { setSaving(false); }
  }

  const inst  = data?.institution  || {};
  const addr  = inst?.address      || {};
  const cont  = inst?.contact      || {};
  const prog  = data?.program      || {};
  const campuses = data?.campuses  || [];
  const fin   = data?.financials   || {};
  const costs = fin?.costs         || {};
  const period = data?.academic_period || {};
  const meta  = data?.metadata     || {};
  const warnings = meta?.warnings  || [];

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel">

        {/* Header */}
        <div className="modal-header">
          <div>
            <h2>📋 Review Extraction</h2>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {doc.filename} &nbsp;·&nbsp; ID: {doc.document_id.slice(0, 12)}…
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span className={`status-badge ${doc.status}`} style={{ marginRight: 8 }}>{doc.status}</span>
            <button className="btn-icon" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        {/* Body — two panes */}
        <div className="modal-body">

          {/* LEFT: Document Preview */}
          <div className="modal-pane" style={{ background: 'var(--surface-alt)' }}>
            <div className="info-section-title">📄 Original Document</div>
            <DocPreview doc={doc} />

            {/* Warnings */}
            {warnings.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div className="info-section-title">⚠️ Warnings ({warnings.length})</div>
                <div className="warnings-list">
                  {warnings.map((w, i) => (
                    <div key={i} className={`warning-item ${w.startsWith('[SCHEMA]') ? 'schema' : ''}`}>
                      <AlertTriangle size={13} style={{ flexShrink: 0 }} />
                      {w}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: Editable cardwise data */}
          <div className="modal-pane">
            <div className="info-section-title">✏️ Extracted Data — Click to Edit</div>

            {/* Institution */}
            <Section icon="🏫" iconClass="icon-inst" title="Institution">
              <div className="field-grid">
                <Field label="Institution Name" value={inst.name} onChange={v => set('institution.name', v)} full />
                <Field label="Street" value={addr.street} onChange={v => set('institution.address.street', v)} />
                <Field label="City" value={addr.city} onChange={v => set('institution.address.city', v)} />
                <Field label="State" value={addr.state} onChange={v => set('institution.address.state', v)} />
                <Field label="Country" value={addr.country} onChange={v => set('institution.address.country', v)} />
                <Field label="Postal Code" value={addr.zip_code} onChange={v => set('institution.address.zip_code', v)} />
                <Field label="Website" value={inst.website} onChange={v => set('institution.website', v)} full />
                <Field label="Email" value={cont.email} onChange={v => set('institution.contact.email', v)} />
                <Field label="Phone" value={cont.phone} onChange={v => set('institution.contact.phone', v)} />
              </div>
            </Section>

            {/* Campuses */}
            <Section icon="📍" iconClass="icon-prog" title="Campuses">
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 11, padding: '2px 8px', height: 'auto', border: '1px solid var(--border)' }}
                  onClick={() => {
                    const newCampuses = [...campuses, { name: '', short_name: '', address: '', phone: '', email: '', description: '' }];
                    set('campuses', newCampuses);
                  }}
                >
                  + Add Campus
                </button>
              </div>
              {campuses.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 12, fontSize: 13, fontStyle: 'italic' }}>
                  No campuses extracted.
                </div>
              ) : (
                campuses.map((campus, idx) => (
                  <div key={idx} style={{
                    background: 'var(--surface-alt)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: 12, marginBottom: 10, position: 'relative'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>Campus {idx + 1} of {campuses.length}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const newCampuses = campuses.filter((_, i) => i !== idx);
                          set('campuses', newCampuses);
                        }}
                        style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 15, fontWeight: 'bold' }}
                        title="Remove Campus"
                      >
                        &times;
                      </button>
                    </div>
                    <div className="field-grid">
                      <Field label="Campus Name" value={campus.name} onChange={v => {
                        const newCampuses = [...campuses];
                        newCampuses[idx] = { ...campus, name: v };
                        set('campuses', newCampuses);
                      }} full />
                      <Field label="Short Name" value={campus.short_name} onChange={v => {
                        const newCampuses = [...campuses];
                        newCampuses[idx] = { ...campus, short_name: v };
                        set('campuses', newCampuses);
                      }} />
                      <Field label="Address" value={campus.address} onChange={v => {
                        const newCampuses = [...campuses];
                        newCampuses[idx] = { ...campus, address: v };
                        set('campuses', newCampuses);
                      }} />
                      <Field label="Phone" value={campus.phone} onChange={v => {
                        const newCampuses = [...campuses];
                        newCampuses[idx] = { ...campus, phone: v };
                        set('campuses', newCampuses);
                      }} />
                      <Field label="Email" value={campus.email} onChange={v => {
                        const newCampuses = [...campuses];
                        newCampuses[idx] = { ...campus, email: v };
                        set('campuses', newCampuses);
                      }} />
                      <Field label="Description" value={campus.description} onChange={v => {
                        const newCampuses = [...campuses];
                        newCampuses[idx] = { ...campus, description: v };
                        set('campuses', newCampuses);
                      }} full />
                    </div>
                  </div>
                ))
              )}
            </Section>

            {/* Program */}
            <Section icon="📚" iconClass="icon-prog" title="Academic Program">
              <div className="field-grid">
                <Field label="Program Name" value={prog.name} onChange={v => set('program.name', v)} full />
                <Field label="Level" value={prog.level} onChange={v => set('program.level', v)}
                  options={['Undergraduate','Postgraduate','Diploma','Certificate','MBA','PhD','Technical','Other']} />
                <Field label="Modality" value={prog.modality} onChange={v => set('program.modality', v)}
                  options={['On-site','Online','Hybrid']} />
                <Field label="Field of Study" value={prog.field_of_study} onChange={v => set('program.field_of_study', v)} />
                <Field label="Language" value={prog.language_of_instruction} onChange={v => set('program.language_of_instruction', v)} />
                <Field label="Duration" value={prog.duration} onChange={v => set('program.duration', v)} />
                <Field label="Schedule" value={prog.schedule} onChange={v => set('program.schedule', v)} />
              </div>
            </Section>

            {/* Academic Period */}
            <Section icon="📅" iconClass="icon-cal" title="Academic Period">
              <div className="field-grid">
                <Field label="Period Name" value={period.period_name} onChange={v => set('academic_period.period_name', v)} />
                <Field label="Period Type" value={period.period_type} onChange={v => set('academic_period.period_type', v)}
                  options={['Semester','Trimester','Monthly','Annual','Quarterly','Other']} />
                <Field label="Start Date" value={period.start_date} onChange={v => set('academic_period.start_date', v)} type="date" />
                <Field label="End Date"   value={period.end_date}   onChange={v => set('academic_period.end_date', v)}   type="date" />
                <Field label="Application Deadline" value={period.application_deadline} onChange={v => set('academic_period.application_deadline', v)} type="date" />
              </div>
            </Section>

            {/* Financials */}
            <Section icon="💰" iconClass="icon-fin" title="Costs & Financials">
              <div className="field-grid">
                <Field label="Currency" value={fin.currency} onChange={v => set('financials.currency', v)}
                  options={['MXN','BRL','USD','EUR','COP','ARS','CLP','PEN']} />
              </div>
              <div style={{ marginTop: 10 }}>
                {[
                  ['Enrollment Fee', costs.enrollment_fee, 'financials.costs.enrollment_fee'],
                  ['Tuition Fee',    costs.tuition_fee,    'financials.costs.tuition_fee'],
                  ['Materials Fee',  costs.materials_fee,  'financials.costs.materials_fee'],
                  ['Total Cost',     costs.total_cost,     'financials.costs.total_cost'],
                ].map(([label, val, path]) => (
                  <div className="fee-row" key={path}>
                    <span className="fee-row-label">{label}</span>
                    <input type="number" value={num(val)}
                      onChange={e => set(path, e.target.value ? parseFloat(e.target.value) : null)}
                      style={{ width: 130, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, fontWeight: 700, fontSize: 14, textAlign: 'right' }}
                    />
                  </div>
                ))}
              </div>

              {/* Installments */}
              {fin.payment_installments?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div className="info-section-title" style={{ marginBottom: 8 }}>Payment Installments</div>
                  {fin.payment_installments.map((inst, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center', fontSize: 13 }}>
                      <span className="tag">#{inst.installment_number}</span>
                      <span style={{ fontWeight: 700 }}>{fin.currency} {Number(inst.amount).toLocaleString()}</span>
                      {inst.due_date && <span style={{ color: 'var(--text-muted)' }}>Due: {inst.due_date}</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* Scholarships */}
              {fin.scholarships?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div className="info-section-title" style={{ marginBottom: 8 }}>Scholarships</div>
                  {fin.scholarships.map((s, i) => (
                    <div key={i} style={{ background: 'var(--status-approved-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', marginBottom: 6, fontSize: 13 }}>
                      <strong>{s.title || 'Scholarship'}</strong>
                      {s.discount_percentage != null && <span style={{ marginLeft: 8, color: 'var(--accent-green)', fontWeight: 700 }}>−{s.discount_percentage}%</span>}
                      {s.description && <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>{s.description}</div>}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Reject textarea */}
            {rejecting && (
              <div style={{ marginTop: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--status-rejected)' }}>
                  Rejection Reason *
                </label>
                <textarea className="reject-input" placeholder="Describe why this document is being rejected…"
                  value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
              </div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="modal-footer">
          <button className="btn btn-ghost btn-sm" onClick={handleReprocess} disabled={saving}>
            <RotateCcw size={13} /> Reprocess
          </button>
          <div className="spacer" />
          {!rejecting ? (
            <button className="btn btn-danger btn-sm" onClick={() => setRejecting(true)}>
              <XCircle size={13} /> Reject
            </button>
          ) : (
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => setRejecting(false)}>Cancel</button>
              <button className="btn btn-danger btn-sm" onClick={handleReject} disabled={saving}>
                Confirm Reject
              </button>
            </>
          )}
          {!rejecting && (
            <button className="btn btn-success" onClick={handleApprove} disabled={saving}>
              <Check size={15} /> {saving ? 'Approving…' : 'Approve & Publish'}
            </button>
          )}
        </div>

        {/* Toast */}
        {toast && (
          <div className="toast-container">
            <div className={`toast ${toast.type}`}>{toast.msg}</div>
          </div>
        )}
      </div>
    </div>
  );
}
