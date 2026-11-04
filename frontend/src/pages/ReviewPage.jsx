import { AlertOctagon, AlertTriangle, ArrowLeft, Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Code2, Coins, Database, Eye, FileEdit, FileSpreadsheet, FileText, Globe, GraduationCap, Inbox, Loader2, MapPin, RotateCcw, School, Search, XCircle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { renderAsync as renderDocxAsync } from 'docx-preview';
import { FileIcon, formatCurrency } from '../components/DocumentCard';
import StatusBadge from '../components/StatusBadge';
import { approveDoc, getDocument, getDocuments, rejectDoc, reprocessDoc, translateText, updateJson } from '../services/client';

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

function getExt(f) { return (f || '').split('.').pop().toLowerCase(); }
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Collapsible Section ────────────────────────────────────────────────────
function Collapse({ title, icon, defaultOpen = true, badge, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
          background: 'var(--surface-alt)', border: 'none', cursor: 'pointer', fontWeight: 600,
          fontSize: 13, color: 'var(--text)'
        }}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {icon} {title}
        {badge != null && (
          <span style={{
            marginLeft: 'auto', background: 'var(--primary)', color: 'white',
            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100
          }}>{badge}</span>
        )}
      </button>
      {open && <div style={{ padding: 14 }}>{children}</div>}
    </div>
  );
}

// ── Editable field ─────────────────────────────────────────────────────────
function Field({ label, value, onChange, type = 'text', options, full }) {
  return (
    <div className={`field-item ${full ? 'full' : ''}`}>
      <label>{label}</label>
      {options ? (
        <select value={value || ''} onChange={e => onChange(e.target.value || null)}>
          <option value="">— null —</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type} value={value || ''} onChange={e => onChange(e.target.value || null)} autoComplete="off" />
      )}
    </div>
  );
}

// deep-set helper
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

// ── Campus Card (editable, with nested academic_programs) ────────────────────
function CampusCard({ campus, idx, total, onChange, onRemove }) {
  const programs = campus.academic_programs || [];

  function set(key, val) {
    onChange({ ...campus, [key]: val });
  }

  function updateProgram(progIdx, updated) {
    const newProgs = [...programs];
    newProgs[progIdx] = updated;
    onChange({ ...campus, academic_programs: newProgs });
  }

  return (
    <div style={{
      background: 'var(--surface)', border: '2px solid var(--border)',
      borderRadius: 'var(--radius)', padding: 16, marginBottom: 14, position: 'relative'
    }}>
      {/* Campus header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{
          width: 28, height: 28, background: 'var(--primary-light)', borderRadius: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 800, color: 'var(--primary)'
        }}>{idx + 1}</div>
        <span style={{ fontWeight: 700, fontSize: 14 }}>Campus {idx + 1} of {total}</span>
        {programs.length > 0 && (
          <span style={{
            background: 'var(--primary)', color: 'white',
            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100
          }}>{programs.length} program{programs.length > 1 ? 's' : ''}</span>
        )}
        <button
          type="button"
          onClick={onRemove}
          style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, fontWeight: 'bold' }}
          title="Remove Campus"
        >
          &times;
        </button>
      </div>

      {/* Campus fields */}
      <div className="field-grid">
        <Field label="Campus Name" value={campus.name} onChange={v => set('name', v)} full />
        <Field label="Short Name" value={campus.short_name} onChange={v => set('short_name', v)} />
        <Field label="Address" value={campus.address} onChange={v => set('address', v)} />
        <Field label="Phone" value={campus.phone} onChange={v => set('phone', v)} />
        <Field label="Email" value={campus.email} onChange={v => set('email', v)} />
        <Field label="Description" value={campus.description} onChange={v => set('description', v)} full />
      </div>

      {/* Nested Programs */}
      <div style={{ marginTop: 14 }}>
        <Collapse title="Academic Programs" icon={<GraduationCap size={13} />} badge={programs.length} defaultOpen={programs.length > 0}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 11, padding: '2px 8px', height: 'auto', border: '1px solid var(--border)' }}
              onClick={() => {
                const newProgs = [...programs, {
                  name: '', level: null, modality: null, field_of_study: null, duration: null,
                  requirements: [], curriculum: [], has_admission_test: null, has_scholarship: null,
                  classification: {}, academic_period: {}, financials: { currency: null, costs: {}, payment_installments: [], scholarships: [] }
                }];
                onChange({ ...campus, academic_programs: newProgs });
              }}
            >
              + Add Program
            </button>
          </div>
          {programs.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 12, fontStyle: 'italic', fontSize: 13 }}>
              No programs extracted for this campus.
            </div>
          ) : (
            programs.map((prog, pIdx) => (
              <ProgramCard
                key={pIdx}
                prog={prog}
                idx={pIdx}
                total={programs.length}
                onChange={(updated) => updateProgram(pIdx, updated)}
              />
            ))
          )}
        </Collapse>
      </div>
    </div>
  );
}

// ── Program Card (editable) ────────────────────────────────────────────────
function ProgramCard({ prog, idx, total, onChange }) {
  function set(key, val) {
    const updated = { ...prog, [key]: val };
    onChange(updated);
  }
  function setNested(path, val) {
    const updated = setPath(prog, path, val);
    onChange(updated);
  }
  const isApproved = prog.approved !== false;
  const period = prog.academic_period || {};
  const fin = prog.financials || {};
  const costs = fin.costs || {};
  const cls = prog.classification || {};

  return (
    <div style={{
      background: isApproved ? 'var(--surface)' : 'var(--surface-alt)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: 14, marginBottom: 12, opacity: isApproved ? 1 : 0.65, transition: 'all 0.2s'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{
          width: 28, height: 28, background: 'var(--primary-light)', borderRadius: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 800, color: 'var(--primary)'
        }}>{idx + 1}</div>
        <span style={{ fontWeight: 700, fontSize: 14 }}>Program {idx + 1} of {total}</span>
        {prog.level && <span className="tag">{prog.level}</span>}
        {prog.modality && <span className="tag">{prog.modality}</span>}
        <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--text)' }}>
          <input type="checkbox" checked={isApproved} onChange={e => set('approved', e.target.checked)} />
          Accept Program
        </label>
      </div>
      <div className="field-grid">
        <Field label="Program Name" value={prog.name} onChange={v => set('name', v)} full />
        <Field label="Level" value={prog.level} onChange={v => set('level', v)}
          options={['Undergraduate', 'Postgraduate', 'Diploma', 'Certificate', 'MBA', 'PhD', 'Technical', 'Baccalaureate', 'Language', 'Course', 'Primary', 'Secondary', 'Preschool', 'Other']} />
        <Field label="Modality" value={prog.modality} onChange={v => set('modality', v)}
          options={['On-site', 'Online', 'Hybrid']} />
        <Field label="Field of Study" value={prog.field_of_study} onChange={v => set('field_of_study', v)} />
        <Field label="Duration" value={prog.duration} onChange={v => set('duration', v)} />
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 10, marginBottom: 4 }}>
        {[
          ['Has Admission Test', 'has_admission_test'],
          ['Has Scholarship', 'has_scholarship'],
        ].map(([label, key]) => (
          <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--text)' }}>
            <input type="checkbox" checked={prog[key] === true} onChange={e => set(key, e.target.checked ? true : false)} />
            {label}
            {prog[key] === null && <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>(null)</span>}
          </label>
        ))}
      </div>

      <div style={{ marginTop: 12 }}>
        <Collapse title="Classification" icon={<Database size={13} />} defaultOpen={false}>
          <div className="field-grid" style={{ marginTop: 8 }}>
            <Field label="Academic Degree" value={cls.academic_degree_key} onChange={v => setNested('classification.academic_degree_key', v)} />
            <Field label="Periodicity" value={cls.periodicity_key} onChange={v => setNested('classification.periodicity_key', v)} />
            <Field label="Modality Key" value={cls.modality_key} onChange={v => setNested('classification.modality_key', v)} />
            <Field label="Knowledge Area" value={cls.knowledge_area_key} onChange={v => setNested('classification.knowledge_area_key', v)} />
            <Field label="Study Area" value={cls.study_area_key} onChange={v => setNested('classification.study_area_key', v)} full />
          </div>
        </Collapse>
      </div>

      <div style={{ marginTop: 12 }}>
        <Collapse title="Academic Period" icon={<Calendar size={13} />} defaultOpen={false}>
          <div className="field-grid" style={{ marginTop: 8 }}>
            <Field label="Period Name" value={period.period_name} onChange={v => setNested('academic_period.period_name', v)} />
            <Field label="Period Type" value={period.period_type} onChange={v => setNested('academic_period.period_type', v)}
              options={['Semester', 'Trimester', 'Monthly', 'Annual', 'Quarterly', 'Other']} />
            <Field label="Start Date" value={period.start_date} onChange={v => setNested('academic_period.start_date', v)} type="date" />
            <Field label="End Date" value={period.end_date} onChange={v => setNested('academic_period.end_date', v)} type="date" />
            <Field label="Registration Opens" value={period.registration_start_date} onChange={v => setNested('academic_period.registration_start_date', v)} type="date" />
            <Field label="Registration Deadline" value={period.registration_end_date} onChange={v => setNested('academic_period.registration_end_date', v)} type="date" />
          </div>
        </Collapse>
      </div>

      <div style={{ marginTop: 12 }}>
        <Collapse title="Financials" icon={<Coins size={13} />} defaultOpen={false}>
          <div style={{ marginTop: 8 }}>
            <Field label="Currency" value={fin.currency} onChange={v => setNested('financials.currency', v)}
              options={['MXN', 'BRL', 'USD', 'EUR', 'COP', 'ARS', 'CLP', 'PEN', 'JPY', 'INR', 'GBP', 'CNY']} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12, marginTop: 10 }}>
              {[
                ['Enrollment Fee', costs.enrollment_fee, 'financials.costs.enrollment_fee'],
                ['Tuition Fee', costs.tuition_fee, 'financials.costs.tuition_fee'],
              ].map(([label, val, path]) => (
                <div key={path} style={{
                  background: 'var(--surface-alt)', border: '1px solid var(--border)',
                  borderRadius: 6, padding: '8px 12px'
                }}>
                  <div style={{
                    fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                    color: 'var(--text-light)', marginBottom: 4
                  }}>{label}</div>
                  <input type="number" value={val ?? ''} placeholder="null"
                    onChange={e => setNested(path, e.target.value ? parseFloat(e.target.value) : null)}
                    style={{
                      width: '100%', border: 'none', background: 'transparent',
                      fontWeight: 800, fontSize: 15, color: 'var(--primary)'
                    }} />
                </div>
              ))}
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-light)' }}>
                  Payment Installments
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 11, padding: '2px 8px', height: 'auto', border: '1px solid var(--border)' }}
                  onClick={() => {
                    const installments = fin.payment_installments || [];
                    const newInst = [...installments, { installment_number: installments.length + 1, amount: 0, due_date: null }];
                    setNested('financials.payment_installments', newInst);
                  }}
                >
                  + Add Installment
                </button>
              </div>
              {(fin.payment_installments || []).length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', padding: '4px 0' }}>No installments.</div>
              ) : (
                (fin.payment_installments || []).map((inst, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: 8, alignItems: 'center', fontSize: 13,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 6, padding: '6px 12px', marginBottom: 6
                  }}>
                    <span className="tag" style={{ flexShrink: 0 }}>#{inst.installment_number}</span>
                    <input
                      type="number"
                      placeholder="Amount"
                      value={inst.amount ?? ''}
                      onChange={e => {
                        const newInst = [...fin.payment_installments];
                        newInst[i] = { ...inst, amount: e.target.value ? parseFloat(e.target.value) : 0 };
                        setNested('financials.payment_installments', newInst);
                      }}
                      style={{ width: 90, border: '1px solid var(--border)', borderRadius: 4, padding: '3px 8px', background: 'white', color: 'var(--text)' }}
                    />
                    <input
                      type="date"
                      value={inst.due_date ?? ''}
                      onChange={e => {
                        const newInst = [...fin.payment_installments];
                        newInst[i] = { ...inst, due_date: e.target.value || null };
                        setNested('financials.payment_installments', newInst);
                      }}
                      style={{ border: '1px solid var(--border)', borderRadius: 4, padding: '3px 8px', background: 'white', color: 'var(--text)', flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const installments = fin.payment_installments || [];
                        const newInst = installments.filter((_, idx) => idx !== i).map((item, idx) => ({ ...item, installment_number: idx + 1 }));
                        setNested('financials.payment_installments', newInst);
                      }}
                      style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, fontWeight: 'bold', padding: '0 4px' }}
                      title="Remove Installment"
                    >
                      &times;
                    </button>
                  </div>
                ))
              )}
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-light)' }}>
                  Scholarships
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 11, padding: '2px 8px', height: 'auto', border: '1px solid var(--border)' }}
                  onClick={() => {
                    const scholarships = fin.scholarships || [];
                    const newSch = [...scholarships, { title: '', description: '', discount_percentage: null }];
                    setNested('financials.scholarships', newSch);
                  }}
                >
                  + Add Scholarship
                </button>
              </div>
              {(fin.scholarships || []).length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', padding: '4px 0' }}>No scholarships.</div>
              ) : (
                (fin.scholarships || []).map((s, i) => (
                  <div key={i} style={{
                    background: 'var(--surface-alt)', border: '1px solid var(--border)',
                    borderRadius: 6, padding: '8px 12px', marginBottom: 6, fontSize: 13, position: 'relative'
                  }}>
                    <button
                      type="button"
                      onClick={() => {
                        const scholarships = fin.scholarships || [];
                        const newSch = scholarships.filter((_, idx) => idx !== i);
                        setNested('financials.scholarships', newSch);
                      }}
                      style={{ position: 'absolute', top: 4, right: 8, background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, fontWeight: 'bold' }}
                      title="Remove Scholarship"
                    >
                      &times;
                    </button>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, marginRight: 16 }}>
                      <input
                        type="text"
                        placeholder="Scholarship Title"
                        value={s.title || ''}
                        onChange={e => {
                          const newSch = [...fin.scholarships];
                          newSch[i] = { ...s, title: e.target.value };
                          setNested('financials.scholarships', newSch);
                        }}
                        style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 4, padding: '3px 8px', background: 'white', color: 'var(--text)' }}
                      />
                      <input
                        type="number"
                        placeholder="Discount %"
                        value={s.discount_percentage ?? ''}
                        onChange={e => {
                          const newSch = [...fin.scholarships];
                          newSch[i] = { ...s, discount_percentage: e.target.value ? parseFloat(e.target.value) : null };
                          setNested('financials.scholarships', newSch);
                        }}
                        style={{ width: 85, border: '1px solid var(--border)', borderRadius: 4, padding: '3px 8px', background: 'white', color: 'var(--text)' }}
                      />
                    </div>
                    <textarea
                      placeholder="Scholarship Description"
                      value={s.description || ''}
                      onChange={e => {
                        const newSch = [...fin.scholarships];
                        newSch[i] = { ...s, description: e.target.value };
                        setNested('financials.scholarships', newSch);
                      }}
                      style={{ width: '100%', minHeight: 40, border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', background: 'white', color: 'var(--text)', resize: 'vertical', fontSize: 12, marginTop: 4 }}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        </Collapse>
      </div>

      {/* Editable Requirements Section */}
      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-light)' }}>
            Requirements ({(prog.requirements || []).length})
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 11, padding: '2px 6px', color: 'var(--primary)' }}
            onClick={() => {
              const reqs = [...(prog.requirements || []), ''];
              set('requirements', reqs);
            }}
          >
            + Add Requirement
          </button>
        </div>
        {(prog.requirements || []).map((req, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
            <input
              type="text"
              value={req}
              placeholder="Requirement detail..."
              onChange={e => {
                const reqs = [...(prog.requirements || [])];
                reqs[i] = e.target.value;
                set('requirements', reqs);
              }}
              style={{
                flex: 1, border: '1px solid var(--border)', borderRadius: 4,
                padding: '4px 8px', fontSize: 12, background: 'white', color: 'var(--text)'
              }}
            />
            <button
              type="button"
              onClick={() => {
                const reqs = (prog.requirements || []).filter((_, idx) => idx !== i);
                set('requirements', reqs);
              }}
              style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, fontWeight: 'bold', padding: '0 4px' }}
              title="Remove Requirement"
            >
              &times;
            </button>
          </div>
        ))}
      </div>

      {/* Editable Curriculum Section */}
      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-light)' }}>
            Curriculum ({(prog.curriculum || []).length})
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 11, padding: '2px 6px', color: 'var(--primary)' }}
            onClick={() => {
              const curr = [...(prog.curriculum || []), ''];
              set('curriculum', curr);
            }}
          >
            + Add Subject/Module
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(prog.curriculum || []).map((subject, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="text"
                value={subject}
                placeholder="Subject or module name..."
                onChange={e => {
                  const curr = [...(prog.curriculum || [])];
                  curr[i] = e.target.value;
                  set('curriculum', curr);
                }}
                style={{
                  flex: 1, border: '1px solid var(--border)', borderRadius: 4,
                  padding: '4px 8px', fontSize: 12, background: 'white', color: 'var(--text)'
                }}
              />
              <button
                type="button"
                onClick={() => {
                  const curr = (prog.curriculum || []).filter((_, idx) => idx !== i);
                  set('curriculum', curr);
                }}
                style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, fontWeight: 'bold', padding: '0 4px' }}
                title="Remove Subject"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Browser-Side Embedded Document Renderers ─────────────────────────────────
function OfficeEmbedViewer({ fileUrl, filename, isDragging }) {
  const [engine, setEngine] = useState('office'); // 'office' | 'google'
  const ext = getExt(filename);

  const officeUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;
  const googleUrl = `https://docs.google.com/gview?url=${encodeURIComponent(fileUrl)}&embedded=true`;

  const headerBg = ['xlsx', 'xls', 'csv'].includes(ext) ? '#047857' : '#1d4ed8';

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#f8fafc', overflow: 'hidden' }}>
      {/* Viewer Header Toolbar */}
      <div style={{ padding: '8px 14px', background: headerBg, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {['xlsx', 'xls', 'csv'].includes(ext) ? <FileSpreadsheet size={16} /> : <FileEdit size={16} />}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{filename}</span>
        </div>

        {/* Engine Selector Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(0,0,0,0.2)', padding: 3, borderRadius: 6 }}>
          <button
            onClick={() => setEngine('office')}
            style={{
              padding: '3px 8px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
              background: engine === 'office' ? 'white' : 'transparent',
              color: engine === 'office' ? '#1e293b' : 'rgba(255,255,255,0.85)',
              transition: 'all 0.15s'
            }}
            title="Render using Microsoft Office Web Engine"
          >
            🏢 Office View
          </button>
          <button
            onClick={() => setEngine('google')}
            style={{
              padding: '3px 8px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
              background: engine === 'google' ? 'white' : 'transparent',
              color: engine === 'google' ? '#1e293b' : 'rgba(255,255,255,0.85)',
              transition: 'all 0.15s'
            }}
            title="Render using Google Docs Viewer Engine"
          >
            🌐 Google View
          </button>
        </div>

        <a href={fileUrl} download={filename} className="btn btn-ghost btn-sm" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)', fontSize: 11, padding: '3px 10px', height: 'auto' }}>
          Download
        </a>
      </div>

      {/* Main View Area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {engine === 'office' ? (
          <iframe
            src={officeUrl}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              pointerEvents: isDragging ? 'none' : 'auto'
            }}
            title="Office Document Preview"
          />
        ) : (
          <iframe
            src={googleUrl}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              pointerEvents: isDragging ? 'none' : 'auto'
            }}
            title="Google Docs Preview"
          />
        )}
      </div>
    </div>
  );
}

function TxtViewer({ fileUrl, filename, rawText }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    async function loadTxt() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const content = await res.text();
        if (active) setText(content);
      } catch (err) {
        if (active) setError(err.message || 'Failed to load text file');
      } finally {
        if (active) setLoading(false);
      }
    }
    if (fileUrl && fileUrl !== '#') loadTxt();
    else setLoading(false);
    return () => { active = false; };
  }, [fileUrl]);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#f1f5f9', overflow: 'hidden' }}>
      <div style={{ padding: '10px 16px', background: '#475569', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}>
          <FileText size={16} />
          <span>{filename}</span>
          <span style={{ fontSize: 10, background: '#334155', padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase' }}>Text View</span>
        </div>
        <a href={fileUrl} download={filename} className="btn btn-ghost btn-sm" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)', fontSize: 11 }}>
          Download File
        </a>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', justifyContent: 'center' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, height: '100%', color: 'var(--text-muted)' }}>
            <Loader2 className="animate-spin" size={32} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Loading text object…</span>
          </div>
        ) : (
          <div style={{ background: 'white', width: '100%', maxWidth: 750, minHeight: 600, padding: 32, borderRadius: 4, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
            <pre style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace', color: '#1e293b', margin: 0 }}>
              {error ? (rawText || 'No text available') : text}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function OriginalDocumentViewer({ doc, isDragging }) {
  const filename = doc?.filename || '';
  const docId = doc?.document_id || '';
  const ext = getExt(filename);
  const fileUrl = docId ? `${API_BASE}/documents/${docId}/file` : '#';
  const rawText = typeof doc?.raw_text === 'string' ? doc.raw_text : '';

  if (ext === 'pdf') {
    return (
      <iframe
        src={fileUrl}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          pointerEvents: isDragging ? 'none' : 'auto'
        }}
        title="PDF Document Preview"
      />
    );
  } else if (['xlsx', 'xls', 'csv', 'docx', 'doc', 'ppt', 'pptx'].includes(ext)) {
    return <OfficeEmbedViewer fileUrl={fileUrl} filename={filename} isDragging={isDragging} rawText={rawText} />;
  } else if (ext === 'txt') {
    return <TxtViewer fileUrl={fileUrl} filename={filename} rawText={rawText} />;
  } else if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'tiff'].includes(ext)) {
    return (
      <div style={{ width: '100%', height: '100%', overflow: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <img src={fileUrl} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-md)' }} alt="Uploaded Document" />
      </div>
    );
  } else {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 40, textAlign: 'center', color: 'var(--text-light)' }}>
        <FileIcon filename={filename} size={48} />
        <div>
          <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14 }}>{filename || 'Unknown file'}</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>This file type ({ext ? ext.toUpperCase() : 'UNKNOWN'}) cannot be rendered directly inline.</div>
        </div>
        <a href={fileUrl} download={filename} className="btn btn-ghost btn-sm" style={{ borderColor: 'var(--border)' }}>
          Download File to View
        </a>
      </div>
    );
  }
}

// ── Detail Panel (right side) ───────────────────────────────────────────────
function DetailPanel({ doc, onAction, onBack }) {
  const parseJson = (raw) => {
    if (!raw) return {};
    let parsed = {};
    if (typeof raw === 'object') {
      parsed = raw;
    } else {
      try { parsed = JSON.parse(raw); } catch { return {}; }
    }
    if (parsed && !parsed.campuses && parsed.programs && Array.isArray(parsed.programs)) {
      parsed = {
        ...parsed,
        campuses: [{
          name: null,
          academic_programs: parsed.programs
        }]
      };
      delete parsed.programs;
    }
    return parsed;
  };

  const [data, setData] = useState(() => parseJson(doc.extracted_json));
  const [tab, setTab] = useState('cards');  // 'cards' | 'json' | 'text'
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [translatedText, setTranslatedText] = useState('');
  const [translating, setTranslating] = useState(false);
  const [showWarningsList, setShowWarningsList] = useState(false);
  const warningRef = useRef(null);

  const [leftWidth, setLeftWidth] = useState(45); // percentage (e.g. 45%)
  const [isDragging, setIsDragging] = useState(false);

  // Close warning overlay when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (warningRef.current && !warningRef.current.contains(e.target)) {
        setShowWarningsList(false);
      }
    }
    if (showWarningsList) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showWarningsList]);

  const startDrag = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const doDrag = useCallback((e) => {
    if (!isDragging) return;
    const percentage = (e.clientX / window.innerWidth) * 100;
    // Limit width between 20% and 80%
    if (percentage > 20 && percentage < 80) {
      setLeftWidth(percentage);
    }
  }, [isDragging]);

  const stopDrag = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', doDrag);
      window.addEventListener('mouseup', stopDrag);
    } else {
      window.removeEventListener('mousemove', doDrag);
      window.removeEventListener('mouseup', stopDrag);
    }
    return () => {
      window.removeEventListener('mousemove', doDrag);
      window.removeEventListener('mouseup', stopDrag);
    };
  }, [isDragging, doDrag, stopDrag]);


  // Reset when a new doc is selected
  useEffect(() => {
    setData(parseJson(doc.extracted_json));
    setRejecting(false);
    setRejectReason('');
    setTab('cards');
    setTranslatedText('');
    setTranslating(false);
  }, [doc.document_id]);

  async function handleTranslateSelection() {
    const selectedText = window.getSelection().toString().trim();
    if (!selectedText) {
      showToast('Please highlight/select some text on the left panel first!', 'error');
      return;
    }
    setTranslating(true);
    try {
      const res = await translateText(selectedText);
      setTranslatedText(res.translated);
    } catch (e) {
      showToast(e?.response?.data?.detail || 'Translation failed', 'error');
    } finally {
      setTranslating(false);
    }
  }

  function showToast(msg, type = 'info') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  function set(path, value) { setData(d => setPath(d, path, value)); }




  async function handleApprove() {
    setSaving(true);
    try {
      const result = await approveDoc(doc.document_id, data);
      showToast(`✓ Approved — ${result.programs_count ?? 1} program(s) saved to production!`, 'success');
      setTimeout(() => onAction(), 1200);
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
      setTimeout(() => onAction(), 1000);
    } catch (e) {
      showToast(e?.response?.data?.detail || 'Rejection failed', 'error');
    } finally { setSaving(false); }
  }

  async function handleReprocess() {
    setSaving(true);
    try {
      await reprocessDoc(doc.document_id);
      showToast('Reprocessing started…', 'info');
      setTimeout(() => onAction(), 800);
    } catch (e) {
      showToast(e?.response?.data?.detail || 'Reprocess failed', 'error');
    } finally { setSaving(false); }
  }

  async function handleSaveDraft() {
    setSaving(true);
    try {
      await updateJson(doc.document_id, data);
      showToast('✓ Draft saved successfully!', 'success');
    } catch (e) {
      showToast(e?.response?.data?.detail || 'Save draft failed', 'error');
    } finally { setSaving(false); }
  }

  const inst = data?.institution || {};
  const addr = inst?.address || {};
  const contact = inst?.contact || {};
  const campuses = data?.campuses || [];
  const programs = campuses.flatMap(c => c.academic_programs || []);
  const totalPrograms = programs.length;
  const meta = data?.metadata || {};
  const warnings = meta?.warnings || [];
  const confidence = Math.round((doc.confidence_score || 0) * 100);

  // Tab styles
  const tabStyle = (active) => ({
    padding: '8px 16px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
    borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
    color: active ? 'var(--primary)' : 'var(--text-muted)',
    background: 'transparent',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>

      {/* Doc header bar */}
      <div style={{
        padding: '12px 20px', borderBottom: '1px solid var(--border)',
        background: 'var(--surface)', flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <ArrowLeft size={14} /> Back to Documents
          </button>
          <FileIcon filename={doc?.filename} size={20} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{doc?.filename || 'Untitled Document'}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {(doc?.document_id || '').slice(0, 12)}… · {fmtDate(doc?.extraction_timestamp)}
              · Method: <b>{doc?.extraction_method || meta?.extraction_method || data?.extraction_method || '—'}</b>
              {doc?.uploaded_by && <span> · Uploaded by: <b style={{ color: 'var(--text)' }}>{doc.uploaded_by}</b></span>}
              {doc?.approved_by && <span> · Approved by: <b style={{ color: 'var(--accent-green)' }}>{doc.approved_by}</b></span>}
              {doc?.rejected_by && <span> · Rejected by: <b style={{ color: 'var(--status-rejected)' }}>{doc.rejected_by}</b></span>}
              {doc?.edited_by && <span> · Last edited by: <b style={{ color: 'var(--primary)' }}>{doc.edited_by}</b></span>}
            </div>
          </div>
          <StatusBadge status={doc?.status} />

          {/* Warnings Banner - Clickable Floating Popover Overlay */}
          {warnings.length > 0 && (
            <div ref={warningRef} style={{ position: 'relative', marginTop: 8 }}>
              <div
                onClick={() => setShowWarningsList(prev => !prev)}
                style={{
                  background: '#fffbeb',
                  border: '1px solid #fde68a',
                  borderRadius: 6,
                  padding: '6px 12px',
                  fontSize: 12,
                  color: '#92400e',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  userSelect: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 6
                }}
                title="Click to toggle warnings popover"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <AlertTriangle size={14} style={{ color: '#d97706', flexShrink: 0 }} />
                  <span>
                    {warnings.length} warning(s): {warnings[0]}{warnings.length > 1 ? ` (+${warnings.length - 1} more)` : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#b45309', flexShrink: 0 }}>
                  <span>{showWarningsList ? 'Close' : 'View all'}</span>
                  {showWarningsList ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
              </div>

              {/* Floating Popover Overlay */}
              {showWarningsList && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: 0,
                    right: 0,
                    background: 'white',
                    border: '1px solid #fde68a',
                    borderRadius: 8,
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                    padding: 12,
                    zIndex: 200,
                    maxHeight: 280,
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>
                    <span>All Warnings ({warnings.length})</span>

                  </div>
                  {warnings.map((w, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 8, lineHeight: 1.4,
                        background: w.startsWith('[SCHEMA]') ? '#fef2f2' : '#fff7ed',
                        border: `1px solid ${w.startsWith('[SCHEMA]') ? '#fca5a5' : '#fed7aa'}`,
                        borderRadius: 6, padding: '8px 10px',
                        color: w.startsWith('[SCHEMA]') ? '#991b1b' : '#9a3412',
                        fontSize: 12
                      }}
                    >
                      <span style={{ fontWeight: 700, flexShrink: 0 }}>•</span>
                      <span style={{ flex: 1, wordBreak: 'break-word' }}>{w}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <span style={{
            marginLeft: 'auto', fontWeight: 700, fontSize: 13,
            color: confidence >= 75 ? 'var(--accent-green)' : confidence >= 45 ? 'var(--status-pending)' : 'var(--status-rejected)'
          }}>
            Confidence: {confidence}%
          </span>
        </div>
      </div>

      {/* Split-pane content wrapper */}
      <div style={{ display: 'flex', flex: 1, width: '100%', overflow: 'hidden' }}>

        {/* LEFT: Document Viewer */}
        <div style={{ width: `${leftWidth}%`, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', background: '#f1f5f9', overflow: 'hidden' }}>
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', position: 'relative' }}>
            <OriginalDocumentViewer doc={doc} isDragging={isDragging} />
          </div>
        </div>

        {/* DRAG RESIZER */}
        <div
          onMouseDown={startDrag}
          style={{
            width: '6px',
            cursor: 'col-resize',
            background: isDragging ? 'var(--primary)' : 'var(--border)',
            transition: 'background 0.2s',
            zIndex: 10,
            userSelect: 'none',
            position: 'relative'
          }}
          title="Drag to resize panels"
        >
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '2px',
            height: '24px',
            background: 'var(--text-light)',
            borderRadius: '1px',
            opacity: 0.5
          }} />
        </div>

        {/* RIGHT: Edit Form & Action Panel */}
        <div style={{ width: `${100 - leftWidth}%`, display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, overflow: 'hidden' }}>

          {/* Tab switcher */}
          <div style={{
            display: 'flex', borderBottom: '1px solid var(--border)',
            background: 'var(--surface)', flexShrink: 0
          }}>
            <button onClick={() => setTab('cards')} style={{ display: 'flex', alignItems: 'center', gap: 6, ...tabStyle(tab === 'cards') }}>
              <Database size={14} /> Structured Data
              {totalPrograms > 0 && <span style={{
                marginLeft: 6, background: 'var(--primary)',
                color: 'white', fontSize: 10, padding: '1px 6px', borderRadius: 100
              }}>{totalPrograms}</span>}
            </button>
            <button onClick={() => setTab('json')} style={{ display: 'flex', alignItems: 'center', gap: 6, ...tabStyle(tab === 'json') }}>
              <Code2 size={14} /> JSON
            </button>
            <button onClick={() => setTab('text')} style={{ display: 'flex', alignItems: 'center', gap: 6, ...tabStyle(tab === 'text') }}>
              <FileText size={14} /> Raw Text
            </button>
          </div>

          {/* Scrollable content area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 20, background: 'var(--bg)' }}>

            {/* ── CARDS TAB ──────────────────────────────────────────────────── */}
            {tab === 'cards' && (
              <>
                <Collapse title="Institution" icon={<School size={15} />} defaultOpen>
                  <div className="field-grid">
                    <Field label="Name" value={inst.name} onChange={v => set('institution.name', v)} full />
                    <Field label="Street" value={addr.street} onChange={v => set('institution.address.street', v)} />
                    <Field label="City" value={addr.city} onChange={v => set('institution.address.city', v)} />
                    <Field label="State" value={addr.state} onChange={v => set('institution.address.state', v)} />
                    <Field label="Country" value={addr.country} onChange={v => set('institution.address.country', v)} />
                    <Field label="Postal Code" value={addr.zip_code} onChange={v => set('institution.address.zip_code', v)} />
                    <Field label="Website" value={inst.website} onChange={v => set('institution.website', v)} />
                    <Field label="Email" value={contact.email} onChange={v => set('institution.contact.email', v)} />
                    <Field label="Phone" value={contact.phone} onChange={v => set('institution.contact.phone', v)} />
                  </div>
                </Collapse>

                {/* Campuses & nested Programs */}
                <Collapse title="Campuses & Programs" icon={<MapPin size={15} />} badge={campuses.length} defaultOpen>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: 11, padding: '2px 8px', height: 'auto', border: '1px solid var(--border)' }}
                      onClick={() => {
                        const newCampuses = [...campuses, { name: '', short_name: '', address: '', phone: '', email: '', description: '', academic_programs: [] }];
                        set('campuses', newCampuses);
                      }}
                    >
                      + Add Campus
                    </button>
                  </div>
                  {campuses.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 16, fontStyle: 'italic' }}>
                      No campuses extracted.
                    </div>
                  ) : (
                    campuses.map((campus, idx) => (
                      <CampusCard
                        key={idx}
                        campus={campus}
                        idx={idx}
                        total={campuses.length}
                        onChange={(updated) => {
                          const newCampuses = [...campuses];
                          newCampuses[idx] = updated;
                          set('campuses', newCampuses);
                        }}
                        onRemove={() => {
                          const newCampuses = campuses.filter((_, i) => i !== idx);
                          set('campuses', newCampuses);
                        }}
                      />
                    ))
                  )}
                </Collapse>


                {/* All warnings */}
                {warnings.length > 0 && (
                  <Collapse title="All Warnings" icon={<AlertTriangle size={15} />} badge={warnings.length} defaultOpen={false}>
                    {warnings.map((w, i) => (
                      <div key={i} className={`warning-item ${w.startsWith('[SCHEMA]') ? 'schema' : ''}`}>
                        <AlertTriangle size={12} style={{ flexShrink: 0 }} />{w}
                      </div>
                    ))}
                  </Collapse>
                )}
              </>
            )}

            {/* ── JSON TAB ───────────────────────────────────────────────────── */}
            {tab === 'json' && (
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 2 }}>
                  <button className="btn btn-ghost btn-sm"
                    onClick={() => navigator.clipboard.writeText(JSON.stringify(data, null, 2))}>
                    Copy JSON
                  </button>
                </div>
                <pre style={{
                  background: '#1e293b', color: '#e2e8f0', borderRadius: 'var(--radius)',
                  padding: 20, fontSize: 12, lineHeight: 1.7,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowX: 'auto',
                  fontFamily: '"Fira Code", "Cascadia Code", Consolas, monospace',
                }}>
                  {JSON.stringify(data, null, 2)}
                </pre>
              </div>
            )}

            {/* ── RAW TEXT TAB ───────────────────────────────────────────────── */}
            {tab === 'text' && (
              <div>
                <div style={{ display: 'flex', gap: 20, alignItems: 'stretch' }}>
                  <div style={{ flex: 1.5, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                      Raw text as extracted by <strong>{doc.extraction_method || 'unknown'}</strong> before LLM normalization.
                      Language detected: <strong>{doc.language_detected || '—'}</strong>.
                      {doc.raw_text && ` ${doc.raw_text.length.toLocaleString()} characters.`}
                    </div>
                    <pre style={{
                      background: '#f8f9fb', border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)', padding: 16, fontSize: 12,
                      lineHeight: 1.75, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      color: 'var(--text)', fontFamily: 'monospace', maxHeight: 500, overflowY: 'auto',
                    }}>
                      {doc.raw_text || 'No raw text available for this document.'}
                    </pre>
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Globe size={15} style={{ color: 'var(--primary)' }} /> Translation Assistant
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text-light)', margin: '0 0 12px 0' }}>
                      Highlight any text section in the left panel, then click the button below to translate it to English.
                    </p>
                    <button className="btn btn-primary btn-sm" onClick={handleTranslateSelection} disabled={translating} style={{ marginBottom: 12, width: '100%' }}>
                      {translating ? 'Translating…' : 'Translate Highlighted Text'}
                    </button>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-light)', marginBottom: 6 }}>English Translation</div>
                      <textarea
                        readOnly
                        placeholder="Translation will appear here..."
                        value={translatedText}
                        style={{
                          flex: 1, width: '100%', minHeight: 200, padding: 12, fontSize: 13,
                          background: 'var(--surface-alt)', border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)', color: 'var(--text)', resize: 'none',
                          fontFamily: 'inherit', lineHeight: 1.5
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Action footer ──────────────────────────────────────────────── */}
          {doc.status === 'pending_review' && (
            <div style={{
              padding: '14px 20px', borderTop: '1px solid var(--border)',
              background: 'var(--surface)', display: 'flex', gap: 10,
              alignItems: 'center', flexShrink: 0
            }}>
              <button className="btn btn-ghost btn-sm" onClick={handleReprocess} disabled={saving}>
                <RotateCcw size={13} /> Reprocess
              </button>
              <button className="btn btn-ghost btn-sm" onClick={handleSaveDraft} disabled={saving} style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}>
                💾 Save Draft
              </button>
              <div style={{ flex: 1 }} />

              {rejecting ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1 }}>
                  <input placeholder="Rejection reason…" value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    style={{
                      flex: 1, padding: '7px 12px', border: '1px solid var(--status-rejected)',
                      borderRadius: 'var(--radius-sm)', fontSize: 13
                    }} />
                  <button className="btn btn-ghost btn-sm" onClick={() => setRejecting(false)}>Cancel</button>
                  <button className="btn btn-danger btn-sm" onClick={handleReject} disabled={saving}>Confirm Reject</button>
                </div>
              ) : (
                <button className="btn btn-danger btn-sm" onClick={() => setRejecting(true)}>
                  <XCircle size={13} /> Reject
                </button>
              )}

              {(() => {
                const approvedCount = programs.filter(p => p.approved !== false).length;
                return (
                  <button className="btn btn-success" onClick={handleApprove} disabled={saving || approvedCount === 0}>
                    <Check size={15} /> {saving ? 'Approving…' : `Approve & Publish (${approvedCount} program${approvedCount !== 1 ? 's' : ''})`}
                  </button>
                );
              })()}
            </div>
          )}

          {toast && (
            <div className="toast-container">
              <div className={`toast ${toast.type}`}>{toast.msg}</div>
            </div>
          )}
        </div>

      </div>

    </div>
  );
}

// ── Document list item (left sidebar) ─────────────────────────────────────
function DocListItem({ doc, selected, onClick }) {
  const data = (() => {
    try {
      let parsed = typeof doc.extracted_json === 'string' ? JSON.parse(doc.extracted_json) : (doc.extracted_json || {});
      if (parsed && !parsed.campuses && parsed.programs && Array.isArray(parsed.programs)) {
        parsed = {
          ...parsed,
          campuses: [{
            name: null,
            academic_programs: parsed.programs
          }]
        };
      }
      return parsed;
    }
    catch { return {}; }
  })();
  const instName = data?.institution?.name;
  const progCount = (data?.campuses || []).reduce((sum, c) => sum + ((c.academic_programs || []).length), 0);
  const pct = Math.round((doc.confidence_score || 0) * 100);
  const confColor = pct >= 75 ? 'var(--accent-green)' : pct >= 45 ? 'var(--status-pending)' : 'var(--status-rejected)';

  return (
    <div onClick={onClick}
      style={{
        padding: '12px 16px', cursor: 'pointer',
        borderBottom: '1px solid var(--border)',
        background: selected ? 'var(--primary-light)' : 'var(--surface)',
        borderLeft: selected ? '3px solid var(--primary)' : '3px solid transparent',
        transition: 'all .15s',
      }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          maxWidth: 180
        }} title={doc.filename}>
          <FileIcon filename={doc.filename} size={14} /> {doc.filename}
        </div>
        <StatusBadge status={doc.status} />
      </div>
      {instName && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', marginTop: 4, whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis'
        }}>
          <School size={12} style={{ color: 'var(--text-light)' }} /> {instName}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
        <div style={{ flex: 1, height: 3, background: 'var(--border)', borderRadius: 100, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: confColor, borderRadius: 100 }} />
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: confColor }}>{pct}%</span>
        {progCount > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 700, color: 'var(--primary)',
            background: 'var(--primary-light)', padding: '1px 6px', borderRadius: 4
          }}>
            {progCount} prog{progCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-light)', marginTop: 3 }}>
        {fmtDate(doc.extraction_timestamp)}
      </div>
    </div>
  );
}

function CourseCard({ course, onReview }) {
  const pct = Math.round((course.confidence_score || 0) * 100);
  const color = pct >= 75 ? 'var(--accent-green)' : pct >= 45 ? 'var(--status-pending)' : 'var(--status-rejected)';

  return (
    <div className="doc-card" style={{ display: 'flex', flexDirection: 'column', padding: 20, minHeight: 330 }}>
      {/* Header Info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <School size={14} style={{ color: 'var(--text-light)' }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={course.institution_name}>{course.institution_name}</span>
          </div>
        </div>
        <StatusBadge status={course.status} />
      </div>

      {/* Main Course Title */}
      <div style={{ flex: 1, marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', height: 44 }} title={course.name}>
          {course.name}
        </div>
      </div>

      {/* Grid Metadata Details (2x2 Aligned) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', padding: '12px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 4 }}>
            <GraduationCap size={10} /> Level
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>{course.level}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 4 }}>
            <MapPin size={10} /> Modality
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>{course.modality}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={10} /> Duration
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>{course.duration}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Calendar size={10} /> Deadline
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>{course.deadline}</div>
        </div>
      </div>

      {/* Highlight cost strip */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tuition Cost</span>
        <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent-teal)' }}>
          {course.tuition != null ? formatCurrency(course.tuition, course.currency) : '—'}
        </span>
      </div>

      {/* Footer controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 'auto' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
            <div className="confidence-bar" style={{ flex: 1, margin: 0 }}>
              <div className="confidence-fill" style={{ width: `${pct}%`, background: color }} />
            </div>
            <span className="confidence-label" style={{ color, fontSize: 11, fontWeight: 700 }}>{pct}% Confidence</span>
          </div>
        </div>
        {course.status === 'pending_review' ? (
          <button className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
            onClick={() => onReview(course.doc)}>
            <Eye size={13} /> Review
          </button>
        ) : (
          <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
            onClick={() => onReview(course.doc)}>
            <Eye size={13} /> View
          </button>
        )}
      </div>
    </div>
  );
}

// ── Real-Time Extraction Stepper Tracker ──────────────────────────────────
function ProcessingPanel({ doc, onBack, onStatusUpdate }) {
  const [currentDoc, setCurrentDoc] = useState(doc);
  const [errorMsg, setErrorMsg] = useState(null);
  const [reprocessing, setReprocessing] = useState(false);

  async function handleReprocess() {
    setReprocessing(true);
    try {
      await reprocessDoc(doc.document_id);
      onStatusUpdate && onStatusUpdate({ ...doc, status: 'processing_extraction' });
    } catch (e) {
      setErrorMsg(e?.response?.data?.detail || 'Reprocess failed');
    } finally {
      setReprocessing(false);
    }
  }

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        if (!doc?.document_id) return;
        const d = await getDocument(doc.document_id);
        if (!active) return;
        setCurrentDoc(d);
        if (d.status === 'failed') {
          setErrorMsg(d.error_message || 'Pipeline failed during processing.');
        } else if (d.status === 'pending_review' || d.status === 'approved' || d.status === 'rejected') {
          onStatusUpdate && onStatusUpdate(d);
        }
      } catch (e) {
        console.error(e);
      }
    };

    poll(); // run immediately
    const id = setInterval(poll, 1500);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [doc?.document_id, onStatusUpdate]);

  const status = currentDoc.status;

  const steps = [
    {
      label: 'Upload Complete',
      desc: 'Brochure saved to staging database layer.',
      status: 'done',
    },
    {
      label: 'OCR & Text Extraction',
      desc: 'Extracting clean structural text layout from brochure pages.',
      status: status === 'processing_extraction'
        ? 'active'
        : (['processing_normalization', 'processing_validation', 'pending_review', 'approved', 'rejected'].includes(status) ? 'done' : 'waiting'),
    },
    {
      label: 'AI Schema Normalization',
      desc: 'LLM parsing variables into relational entity scheme.',
      status: status === 'processing_normalization'
        ? 'active'
        : (['processing_validation', 'pending_review', 'approved', 'rejected'].includes(status) ? 'done' : 'waiting'),
    },
    {
      label: 'Business Rule Validation',
      desc: 'Analyzing fee consistency limits & payment installments check.',
      status: status === 'processing_validation'
        ? 'active'
        : (['pending_review', 'approved', 'rejected'].includes(status) ? 'done' : 'waiting'),
    }
  ];

  if (status === 'failed') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40, background: 'var(--bg)' }}>
        <div style={{
          background: 'var(--surface)', border: '1px solid #fca5a5', borderRadius: 'var(--radius-lg)',
          padding: 32, maxWidth: 540, width: '100%', boxShadow: 'var(--shadow-lg)', textAlign: 'center'
        }}>
          <AlertOctagon size={48} style={{ color: '#ef4444', marginBottom: 16, margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>Pipeline Extraction Failed</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
            An unexpected error occurred while processing this brochure document.
          </p>
          <div style={{
            background: 'var(--status-rejected-bg)', border: '1px solid #fee2e2', borderRadius: 'var(--radius-sm)',
            padding: 16, textAlign: 'left', fontSize: 13, color: '#b91c1c', fontFamily: 'monospace',
            whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginBottom: 24, maxHeight: 180, overflowY: 'auto'
          }}>
            {errorMsg || 'Unknown parsing error or API connection issue.'}
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button className="btn btn-ghost" onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ArrowLeft size={14} /> Back to List
            </button>
            <button className="btn btn-secondary" onClick={handleReprocess} disabled={reprocessing} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <RotateCcw size={14} /> {reprocessing ? 'Reprocessing…' : 'Reprocess Document'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40, background: 'var(--bg)', flex: 1 }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
        padding: 32, maxWidth: 540, width: '100%', boxShadow: 'var(--shadow-lg)'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 16 }}>
          <Loader2 className="animate-spin" size={24} style={{ color: 'var(--primary)' }} />
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text)' }}>Extracting Brochure Intelligence</h2>
            <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 400 }}>
              File: {doc.filename}
            </div>
          </div>
        </div>

        {/* Stepper Timeline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, position: 'relative' }}>
          {/* Vertical connecting line */}
          <div style={{
            position: 'absolute', left: 15, top: 12, bottom: 12, width: 2,
            background: 'var(--border)', zIndex: 1
          }} />

          {steps.map((s, idx) => {
            const isDone = s.status === 'done';
            const isActive = s.status === 'active';
            const isWaiting = s.status === 'waiting';

            let bulletBg = 'var(--surface-alt)';
            let bulletBorder = '2px solid var(--border)';
            let bulletContent = <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-light)' }} />;

            if (isDone) {
              bulletBg = 'var(--status-approved-bg)';
              bulletBorder = '2px solid var(--accent-green)';
              bulletContent = <Check size={12} style={{ color: 'var(--accent-green)' }} />;
            } else if (isActive) {
              bulletBg = 'var(--primary-light)';
              bulletBorder = '2px solid var(--primary)';
              bulletContent = <Loader2 className="animate-spin" size={12} style={{ color: 'var(--primary)' }} />;
            }

            return (
              <div key={idx} style={{ display: 'flex', gap: 16, alignItems: 'flex-start', zIndex: 2 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', background: bulletBg,
                  border: bulletBorder, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0
                }}>
                  {bulletContent}
                </div>
                <div style={{ flex: 1, paddingTop: 4 }}>
                  <h4 style={{
                    fontSize: 13, fontWeight: 700, margin: 0,
                    color: isActive ? 'var(--primary)' : isWaiting ? 'var(--text-light)' : 'var(--text)'
                  }}>
                    {s.label}
                  </h4>
                  <p style={{
                    fontSize: 12, color: isActive ? 'var(--text)' : 'var(--text-muted)',
                    margin: '3px 0 0', lineHeight: 1.4
                  }}>
                    {s.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Progress Strip */}
        <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 11, color: 'var(--text-light)' }}>
            Processing ID: {(doc?.document_id || '').slice(0, 8)}…
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            <ArrowLeft size={12} /> Cancel & Exit
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ReviewPage ────────────────────────────────────────────────────────
export default function ReviewPage() {
  const [docs, setDocs] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('pending_review');
  const [search, setSearch] = useState('');
  const [selectedUniversity, setSelectedUniversity] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const { documentId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const fromPath = location.state?.from || '/documents';

  const load = useCallback(async () => {
    try {
      const data = await getDocuments(filter || undefined);
      setDocs(data);
    } catch (e) {
      console.error(e);
    }
  }, [filter]);

  // Sync route URL parameter with selected document state
  useEffect(() => {
    if (documentId) {
      const found = docs.find(d => d.document_id === documentId);
      if (found) {
        setSelected(found);
      } else {
        // Load directly if accessing a page link directly or refreshing
        getDocument(documentId)
          .then(data => setSelected(data))
          .catch(() => {
            setSelected(null);
            navigate('/review');
          });
      }
    } else {
      setSelected(null);
    }
  }, [documentId, docs, navigate]);

  useEffect(() => { load(); }, [filter]);
  useEffect(() => { const id = setInterval(load, 5000); return () => clearInterval(id); }, [filter]);

  // Flatten docs into individual courses
  const allCourses = [];
  docs.forEach(doc => {
    let data = {};
    if (doc.extracted_json) {
      if (typeof doc.extracted_json === 'string') {
        try { data = JSON.parse(doc.extracted_json); } catch { }
      } else {
        data = doc.extracted_json;
      }
    }
    if (data && !data.campuses && data.programs && Array.isArray(data.programs)) {
      data = {
        ...data,
        campuses: [{
          name: null,
          academic_programs: data.programs
        }]
      };
    }

    const instName = data?.institution?.name || 'Unknown Institution';
    const campuses = data?.campuses || [];

    if (campuses.length === 0) {
      allCourses.push({
        id: `doc-${doc.document_id}`,
        document_id: doc.document_id,
        filename: doc.filename,
        extraction_timestamp: doc.extraction_timestamp,
        status: doc.status,
        confidence_score: doc.confidence_score,
        institution_name: instName,
        name: 'No program extracted yet',
        level: '—',
        modality: '—',
        duration: '—',
        deadline: '—',
        tuition: null,
        currency: null,
        doc: doc
      });
    } else {
      campuses.forEach((campus, cIdx) => {
        const campusProgs = campus.academic_programs || [];
        if (campusProgs.length === 0) {
          allCourses.push({
            id: `doc-${doc.document_id}-campus-${cIdx}`,
            document_id: doc.document_id,
            filename: doc.filename,
            extraction_timestamp: doc.extraction_timestamp,
            status: doc.status,
            confidence_score: doc.confidence_score,
            institution_name: instName,
            name: campus.name ? `Campus: ${campus.name} (No programs)` : 'No program extracted yet',
            level: '—',
            modality: '—',
            duration: '—',
            deadline: '—',
            tuition: null,
            currency: null,
            doc: doc
          });
        } else {
          campusProgs.forEach((prog, idx) => {
            allCourses.push({
              id: `doc-${doc.document_id}-campus-${cIdx}-prog-${idx}`,
              document_id: doc.document_id,
              filename: doc.filename,
              extraction_timestamp: doc.extraction_timestamp,
              status: doc.status,
              confidence_score: doc.confidence_score,
              institution_name: instName,
              name: prog.name || 'No program name',
              level: prog.level || '—',
              modality: prog.modality || '—',
              duration: prog.duration || '—',
              deadline: prog.academic_period?.registration_end_date || prog.academic_period?.application_deadline || '—',
              tuition: prog.financials?.costs?.tuition_fee,
              currency: prog.financials?.currency,
              doc: doc
            });
          });
        }
      });
    }
  });

  const uniqueUniversities = Array.from(new Set(allCourses.map(c => c.institution_name)))
    .filter(name => name && name !== 'Unknown Institution')
    .sort();

  const filteredCourses = allCourses.filter(c => {
    const matchesSearch =
      (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.institution_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.filename || '').toLowerCase().includes(search.toLowerCase());

    const matchesUni = selectedUniversity === 'all' || c.institution_name === selectedUniversity;

    return matchesSearch && matchesUni;
  });

  // Reset page when search term, filter status or university changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filter, selectedUniversity]);

  const totalPages = Math.max(1, Math.ceil(filteredCourses.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedFiltered = filteredCourses.slice(startIndex, startIndex + itemsPerPage);

  const isProcessing = ['unknown', 'processing_extraction', 'processing_normalization', 'processing_validation'].includes(selected?.status);

  if (selected) {
    if (isProcessing) {
      return (
        <div style={{ display: 'flex', height: '100%', overflow: 'hidden', width: '100%' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <ProcessingPanel
              key={selected.document_id}
              doc={selected}
              onBack={() => navigate(fromPath)}
              onStatusUpdate={(updatedDoc) => {
                load();
                setSelected(updatedDoc);
              }}
            />
          </div>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', height: '100%', overflow: 'hidden', width: '100%' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <DetailPanel
            key={selected.document_id}
            doc={selected}
            onAction={() => {
              load();
              navigate(fromPath);
            }}
            onBack={() => navigate(fromPath)}
          />
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '24px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Database size={22} style={{ color: 'var(--primary)' }} /> Review & Approve
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>
            Verify extracted variables, double-check math warnings, and publish brochure data.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }} />
            <input
              placeholder="Search courses or universities…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                padding: '8px 14px 8px 36px', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface)', minWidth: 220
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>Filter by University:</span>
            <select
              value={selectedUniversity}
              onChange={e => setSelectedUniversity(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
                fontSize: 13,
                minWidth: 200,
                outline: 'none'
              }}
            >
              <option value="all">All Universities ({allCourses.length} courses)</option>
              {uniqueUniversities.map(uni => (
                <option key={uni} value={uni}>{uni}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            {['pending_review', 'approved', 'rejected', 'failed', null].map(s => (
              <button key={String(s)} onClick={() => { setFilter(s); }}
                className={`filter-btn ${filter === s ? 'active' : ''}`}
                style={{ fontSize: 12, padding: '6px 14px' }}>
                {s ? s.replace('_', ' ') : 'all'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filteredCourses.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 48, background: 'var(--surface)', padding: 48, border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <Inbox size={48} style={{ color: 'var(--text-light)', marginBottom: 12 }} />
          <h3>No courses found</h3>
          <p>No operational items match the current query or filter status.</p>
        </div>
      ) : (
        <>
          <div className="card-grid">
            {paginatedFiltered.map(course => (
              <CourseCard
                key={course.id}
                course={course}
                onReview={d => navigate(`/review/${d.document_id}`, { state: { from: '/review' } })}
              />
            ))}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, background: 'var(--surface)', padding: '12px 20px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-sm)' }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Showing <strong>{startIndex + 1}</strong> to <strong>{Math.min(startIndex + itemsPerPage, filteredCourses.length)}</strong> of <strong>{filteredCourses.length}</strong> items
              </span>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <ChevronLeft size={14} /> Previous
                </button>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
