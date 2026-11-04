// pages/ProductionPage.jsx — Browse approved normalized data
import { useState, useEffect } from 'react';
import axios from 'axios';
import { School, GraduationCap, Inbox, Database, Globe, Mail, Phone, Calendar, Coins } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

export default function ProductionPage() {
  const [institutions, setInstitutions] = useState([]);
  const [programs, setPrograms]         = useState([]);
  const [tab, setTab]                   = useState('institutions');
  const [selectedInstId, setSelectedInstId] = useState('all');
  const [editingProgram, setEditingProgram] = useState(null);
  const [editingInstitution, setEditingInstitution] = useState(null);

  useEffect(() => {
    axios.get(`${API}/api/production/institutions`).then(r => setInstitutions(r.data)).catch(console.error);
    axios.get(`${API}/api/production/programs`).then(r => setPrograms(r.data)).catch(console.error);
  }, []);

  const filteredPrograms = selectedInstId === 'all'
    ? programs
    : programs.filter(p => String(p.institution_id) === String(selectedInstId));

  // Group programs by institution
  const grouped = filteredPrograms.reduce((acc, p) => {
    const instId = p.institution_id;
    const instName = p.institution_name || 'Unknown Institution';
    if (!acc[instId]) {
      acc[instId] = {
        id: instId,
        name: instName,
        programs: []
      };
    }
    acc[instId].programs.push(p);
    return acc;
  }, {});

  const groupedList = Object.values(grouped);

  const handleSaveProgram = async () => {
    try {
      await axios.put(`${API}/api/production/programs/${editingProgram.id}`, {
        name: editingProgram.name,
        level: editingProgram.level,
        modality: editingProgram.modality,
        duration: editingProgram.duration,
        language_of_instruction: editingProgram.language_of_instruction,
        field_of_study: editingProgram.field_of_study,
        schedule: editingProgram.schedule,
        period_name: editingProgram.period_name,
        period_type: editingProgram.period_type,
        start_date: editingProgram.start_date,
        end_date: editingProgram.end_date,
        application_deadline: editingProgram.application_deadline,
        currency: editingProgram.currency,
        enrollment_fee: editingProgram.enrollment_fee,
        tuition_fee: editingProgram.tuition_fee,
        materials_fee: editingProgram.materials_fee,
        total_cost: editingProgram.total_cost
      });
      // Refresh local programs list
      const r = await axios.get(`${API}/api/production/programs`);
      setPrograms(r.data);
      setEditingProgram(null);
    } catch (e) {
      console.error(e);
      alert('Failed to update program.');
    }
  };

  const handleSaveInstitution = async () => {
    try {
      await axios.put(`${API}/api/production/institutions/${editingInstitution.id}`, {
        name: editingInstitution.name,
        street: editingInstitution.street,
        city: editingInstitution.city,
        state: editingInstitution.state,
        country: editingInstitution.country,
        zip_code: editingInstitution.zip_code,
        website: editingInstitution.website,
        email: editingInstitution.email,
        phone: editingInstitution.phone
      });
      // Refresh local institutions list
      const r = await axios.get(`${API}/api/production/institutions`);
      setInstitutions(r.data);
      setEditingInstitution(null);
    } catch (e) {
      console.error(e);
      alert('Failed to update institution.');
    }
  };


  return (
    <div>
      <div className="page-heading">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Database size={24} style={{ color: 'var(--primary)' }} /> Production Database
        </h1>
        <p>Browse all approved and published institution and program listings currently in production.</p>
      </div>

      <div className="filter-bar" style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className={`filter-btn ${tab === 'institutions' ? 'active' : ''}`}
            onClick={() => setTab('institutions')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <School size={15} /> Institutions ({institutions.length})
          </button>
          <button
            className={`filter-btn ${tab === 'programs' ? 'active' : ''}`}
            onClick={() => setTab('programs')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <GraduationCap size={15} /> Programs ({programs.length})
          </button>
        </div>

        {tab === 'programs' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>Filter by Institution:</span>
            <select
              value={selectedInstId}
              onChange={e => setSelectedInstId(e.target.value)}
              style={{
                padding: '7px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
                fontSize: 13,
                minWidth: 200,
                outline: 'none'
              }}
            >
              <option value="all">All Institutions ({programs.length} programs)</option>
              {institutions.map(inst => (
                <option key={inst.id} value={inst.id}>{inst.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {tab === 'institutions' && (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>City</th>
                <th>Country</th>
                <th>Website</th>
                <th>Email</th>
                <th>Phone</th>
              </tr>
            </thead>
            <tbody>
              {institutions.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <Inbox size={32} style={{ color: 'var(--text-light)' }} />
                      <span>No approved institutions yet. Approve documents to populate this table.</span>
                    </div>
                  </td>
                </tr>
              )}
              {institutions.map(i => (
                <tr key={i.id} onClick={() => setEditingInstitution({ ...i })} style={{ cursor: 'pointer' }} title="Click to view/edit institution details">
                  <td style={{ fontWeight: 600 }}>{i.name}</td>
                  <td>{i.city || '—'}</td>
                  <td>{i.country || '—'}</td>
                  <td>
                    {i.website ? (
                      <a href={i.website} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Globe size={13} /> Visit
                      </a>
                    ) : '—'}
                  </td>
                  <td>
                    {i.email ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Mail size={13} style={{ color: 'var(--text-light)' }} /> {i.email}
                      </span>
                    ) : '—'}
                  </td>
                  <td>
                    {i.phone ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Phone size={13} style={{ color: 'var(--text-light)' }} /> {i.phone}
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'programs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {groupedList.length === 0 ? (
            <div className="empty-state" style={{ padding: 48, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
              <Inbox size={48} style={{ color: 'var(--text-light)', marginBottom: 12 }} />
              <h3>No programs found</h3>
              <p>No programs match the selected filters or have been approved yet.</p>
            </div>
          ) : (
            groupedList.map(group => (
              <div key={group.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 24, boxShadow: 'var(--shadow-sm)' }}>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--primary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                  <School size={16} style={{ color: 'var(--text-light)' }} /> {group.name} Offers ({group.programs.length} course{group.programs.length !== 1 ? 's' : ''})
                </h3>
                <div className="card-grid">
                  {group.programs.map(p => (
                    <div
                      className="info-card"
                      key={p.id}
                      onClick={() => setEditingProgram({ ...p })}
                      style={{
                        margin: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        minHeight: 160,
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        cursor: 'pointer',
                        transition: 'transform 0.2s, box-shadow 0.2s'
                      }}
                      title="Click to view and edit details"
                    >
                      <div>
                        <div className="info-card-header" style={{ marginBottom: 8 }}>
                          <div className="info-card-header-icon icon-prog" style={{ color: 'var(--primary)', background: 'var(--primary-light)' }}>
                            <GraduationCap size={15} />
                          </div>
                          <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{p.name}</h4>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                          <div><span style={{ color: 'var(--text-light)', fontWeight: 500 }}>Level:</span> {p.level || '—'}</div>
                          <div><span style={{ color: 'var(--text-light)', fontWeight: 500 }}>Modality:</span> {p.modality || '—'}</div>
                          <div><span style={{ color: 'var(--text-light)', fontWeight: 500 }}>Duration:</span> {p.duration || '—'}</div>
                          <div><span style={{ color: 'var(--text-light)', fontWeight: 500 }}>Language:</span> {p.language_of_instruction || '—'}</div>
                        </div>
                      </div>
                      <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 8, fontSize: 11, color: 'var(--text-light)' }}>
                        Field: {p.field_of_study || '—'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Program Edit Modal */}
      {editingProgram && (
        <div className="modal-overlay">
          <div className="modal-panel" style={{ maxWidth: 650, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: 16 }}>
                <GraduationCap size={20} style={{ color: 'var(--primary)' }} /> Edit Production Program
              </h2>
              <button
                className="btn-icon"
                onClick={() => setEditingProgram(null)}
                style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: 'var(--text-light)' }}
              >
                &times;
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '24px 28px', overflowY: 'auto', flex: 1 }}>
              
              {/* SECTION: Program Details */}
              <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 4 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)', margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <GraduationCap size={15} /> Program Details
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="field-item">
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-light)', marginBottom: 4 }}>Program Name</label>
                    <input
                      type="text"
                      value={editingProgram.name || ''}
                      onChange={e => setEditingProgram({ ...editingProgram, name: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="field-item">
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-light)', marginBottom: 4 }}>Level</label>
                      <select
                        value={editingProgram.level || ''}
                        onChange={e => setEditingProgram({ ...editingProgram, level: e.target.value || null })}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--bg)' }}
                      >
                        <option value="">— null —</option>
                        {['Undergraduate','Postgraduate','Diploma','Certificate','MBA','PhD','Technical','Other'].map(l => (
                          <option key={l} value={l}>{l}</option>
                        ))}
                      </select>
                    </div>

                    <div className="field-item">
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-light)', marginBottom: 4 }}>Modality</label>
                      <select
                        value={editingProgram.modality || ''}
                        onChange={e => setEditingProgram({ ...editingProgram, modality: e.target.value || null })}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--bg)' }}
                      >
                        <option value="">— null —</option>
                        {['On-site','Online','Hybrid'].map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="field-item">
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-light)', marginBottom: 4 }}>Duration</label>
                      <input
                        type="text"
                        value={editingProgram.duration || ''}
                        onChange={e => setEditingProgram({ ...editingProgram, duration: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}
                      />
                    </div>

                    <div className="field-item">
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-light)', marginBottom: 4 }}>Language of Instruction</label>
                      <input
                        type="text"
                        value={editingProgram.language_of_instruction || ''}
                        onChange={e => setEditingProgram({ ...editingProgram, language_of_instruction: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="field-item">
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-light)', marginBottom: 4 }}>Field of Study</label>
                      <input
                        type="text"
                        value={editingProgram.field_of_study || ''}
                        onChange={e => setEditingProgram({ ...editingProgram, field_of_study: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}
                      />
                    </div>

                    <div className="field-item">
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-light)', marginBottom: 4 }}>Schedule</label>
                      <input
                        type="text"
                        value={editingProgram.schedule || ''}
                        onChange={e => setEditingProgram({ ...editingProgram, schedule: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION: Academic Period */}
              <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 4 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)', margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Calendar size={15} /> Academic Period
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="field-item">
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-light)', marginBottom: 4 }}>Period Name</label>
                      <input
                        type="text"
                        value={editingProgram.period_name || ''}
                        onChange={e => setEditingProgram({ ...editingProgram, period_name: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}
                        placeholder="e.g. Fall 2026"
                      />
                    </div>

                    <div className="field-item">
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-light)', marginBottom: 4 }}>Period Type</label>
                      <select
                        value={editingProgram.period_type || ''}
                        onChange={e => setEditingProgram({ ...editingProgram, period_type: e.target.value || null })}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--bg)' }}
                      >
                        <option value="">— null —</option>
                        {['Semester','Trimester','Monthly','Annual','Quarterly','Other'].map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    <div className="field-item">
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-light)', marginBottom: 4 }}>Start Date</label>
                      <input
                        type="date"
                        value={editingProgram.start_date || ''}
                        onChange={e => setEditingProgram({ ...editingProgram, start_date: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}
                      />
                    </div>

                    <div className="field-item">
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-light)', marginBottom: 4 }}>End Date</label>
                      <input
                        type="date"
                        value={editingProgram.end_date || ''}
                        onChange={e => setEditingProgram({ ...editingProgram, end_date: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}
                      />
                    </div>

                    <div className="field-item">
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-light)', marginBottom: 4 }}>Deadline</label>
                      <input
                        type="date"
                        value={editingProgram.application_deadline || ''}
                        onChange={e => setEditingProgram({ ...editingProgram, application_deadline: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION: Financials */}
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)', margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Coins size={15} /> Financials
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="field-item">
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-light)', marginBottom: 4 }}>Currency</label>
                    <select
                      value={editingProgram.currency || ''}
                      onChange={e => setEditingProgram({ ...editingProgram, currency: e.target.value || null })}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--bg)' }}
                    >
                      <option value="">— null —</option>
                      {['MXN','BRL','USD','EUR','COP','ARS','CLP','PEN'].map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="field-item">
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-light)', marginBottom: 4 }}>Enrollment Fee</label>
                      <input
                        type="number"
                        value={editingProgram.enrollment_fee ?? ''}
                        onChange={e => setEditingProgram({ ...editingProgram, enrollment_fee: e.target.value === '' ? null : Number(e.target.value) })}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}
                      />
                    </div>

                    <div className="field-item">
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-light)', marginBottom: 4 }}>Tuition Fee</label>
                      <input
                        type="number"
                        value={editingProgram.tuition_fee ?? ''}
                        onChange={e => setEditingProgram({ ...editingProgram, tuition_fee: e.target.value === '' ? null : Number(e.target.value) })}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="field-item">
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-light)', marginBottom: 4 }}>Materials Fee</label>
                      <input
                        type="number"
                        value={editingProgram.materials_fee ?? ''}
                        onChange={e => setEditingProgram({ ...editingProgram, materials_fee: e.target.value === '' ? null : Number(e.target.value) })}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}
                      />
                    </div>

                    <div className="field-item">
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-light)', marginBottom: 4 }}>Total Cost</label>
                      <input
                        type="number"
                        value={editingProgram.total_cost ?? ''}
                        onChange={e => setEditingProgram({ ...editingProgram, total_cost: e.target.value === '' ? null : Number(e.target.value) })}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}
                      />
                    </div>
                  </div>
                </div>
              </div>

            </div>
            <div className="modal-footer" style={{ padding: '16px 28px', borderTop: '1px solid var(--border)', display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setEditingProgram(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveProgram}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Institution Edit Modal */}
      {editingInstitution && (
        <div className="modal-overlay">
          <div className="modal-panel" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: 16 }}>
                <School size={20} style={{ color: 'var(--primary)' }} /> Edit Production Institution
              </h2>
              <button
                className="btn-icon"
                onClick={() => setEditingInstitution(null)}
                style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: 'var(--text-light)' }}
              >
                &times;
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '24px 28px', overflowY: 'auto' }}>
              
              <div className="field-item">
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-light)', marginBottom: 4 }}>Institution Name</label>
                <input
                  type="text"
                  value={editingInstitution.name || ''}
                  onChange={e => setEditingInstitution({ ...editingInstitution, name: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}
                />
              </div>

              <div className="field-item">
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-light)', marginBottom: 4 }}>Street Address</label>
                <input
                  type="text"
                  value={editingInstitution.street || ''}
                  onChange={e => setEditingInstitution({ ...editingInstitution, street: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="field-item">
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-light)', marginBottom: 4 }}>City</label>
                  <input
                    type="text"
                    value={editingInstitution.city || ''}
                    onChange={e => setEditingInstitution({ ...editingInstitution, city: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}
                  />
                </div>
                <div className="field-item">
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-light)', marginBottom: 4 }}>State</label>
                  <input
                    type="text"
                    value={editingInstitution.state || ''}
                    onChange={e => setEditingInstitution({ ...editingInstitution, state: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}
                  />
                </div>
                <div className="field-item">
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-light)', marginBottom: 4 }}>Zip Code</label>
                  <input
                    type="text"
                    value={editingInstitution.zip_code || ''}
                    onChange={e => setEditingInstitution({ ...editingInstitution, zip_code: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field-item">
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-light)', marginBottom: 4 }}>Country</label>
                  <input
                    type="text"
                    value={editingInstitution.country || ''}
                    onChange={e => setEditingInstitution({ ...editingInstitution, country: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}
                  />
                </div>
                <div className="field-item">
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-light)', marginBottom: 4 }}>Website</label>
                  <input
                    type="text"
                    value={editingInstitution.website || ''}
                    onChange={e => setEditingInstitution({ ...editingInstitution, website: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field-item">
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-light)', marginBottom: 4 }}>Email</label>
                  <input
                    type="email"
                    value={editingInstitution.email || ''}
                    onChange={e => setEditingInstitution({ ...editingInstitution, email: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}
                  />
                </div>
                <div className="field-item">
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-light)', marginBottom: 4 }}>Phone</label>
                  <input
                    type="text"
                    value={editingInstitution.phone || ''}
                    onChange={e => setEditingInstitution({ ...editingInstitution, phone: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}
                  />
                </div>
              </div>

            </div>
            <div className="modal-footer" style={{ padding: '16px 28px', borderTop: '1px solid var(--border)', display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setEditingInstitution(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveInstitution}>Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
