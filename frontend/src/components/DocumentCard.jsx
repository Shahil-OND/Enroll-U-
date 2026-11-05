// components/DocumentCard.jsx — Program/institution card similar to enroll-u.com listing cards
import { Eye, FileText, FileSpreadsheet, Image as ImageIcon, FileEdit, File, Calendar, GraduationCap, School, MapPin, Clock, Trash2, RotateCw, AlertTriangle } from 'lucide-react';
import StatusBadge from './StatusBadge';

export function FileIcon({ filename, size = 16, style = {} }) {
  const ext = (filename || '').split('.').pop().toLowerCase();
  const baseStyle = { display: 'inline-block', verticalAlign: 'middle', ...style };
  switch (ext) {
    case 'pdf':
      return <FileText size={size} style={{ color: '#dc2626', ...baseStyle }} />;
    case 'docx':
      return <FileEdit size={size} style={{ color: '#2563eb', ...baseStyle }} />;
    case 'xlsx':
      return <FileSpreadsheet size={size} style={{ color: '#16a34a', ...baseStyle }} />;
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'tiff':
      return <ImageIcon size={size} style={{ color: '#ca8a04', ...baseStyle }} />;
    case 'txt':
      return <FileText size={size} style={{ color: '#9333ea', ...baseStyle }} />;
    default:
      return <File size={size} style={{ color: '#4b5563', ...baseStyle }} />;
  }
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatCurrency(amount, currency = 'USD') {
  if (amount == null || amount === '' || isNaN(amount)) return '—';
  const num = Number(amount);
  const curr = (currency || 'USD').toUpperCase();
  const locale = ['COP', 'CLP', 'ARS', 'EUR'].includes(curr) ? 'es-CO' : 'en-US';
  return `${curr} ${num.toLocaleString(locale)}`;
}

function ConfidenceBar({ score }) {
  const pct = Math.round((score || 0) * 100);
  const color = pct >= 75 ? 'var(--accent-green)' : pct >= 45 ? 'var(--status-pending)' : 'var(--status-rejected)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
      <div className="confidence-bar" style={{ flex: 1, margin: 0 }}>
        <div className="confidence-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="confidence-label" style={{ color, fontSize: 11, fontWeight: 700 }}>{pct}% Confidence</span>
    </div>
  );
}

export default function DocumentCard({ doc, onReview, onDelete, onRetry }) {
  let data = typeof doc.extracted_json === 'string'
    ? (() => { try { return JSON.parse(doc.extracted_json); } catch { return null; } })()
    : doc.extracted_json;

  if (data && typeof data === 'object') {
    if (!data.campuses && data.programs && Array.isArray(data.programs)) {
      data = {
        ...data,
        campuses: [{
          name: null,
          academic_programs: data.programs
        }]
      };
    }
  }

  const isFailed = doc.status === 'failed';
  const instName  = data?.institution?.name || (isFailed ? (doc.filename || 'Document Extraction Failed') : 'Unknown Institution');
  
  const campuses  = data?.campuses || [];
  const programs  = campuses.flatMap(c => c.academic_programs || []);
  const prog0     = programs[0] || {};

  const progName  = prog0.name || (isFailed ? (doc.error_message || 'Extraction failed or document format unreadable') : 'No program name');
  const currency  = prog0.financials?.currency || data?.financials?.currency || 'USD';
  const tuition   = prog0.financials?.costs?.tuition_fee ?? data?.financials?.costs?.tuition_fee;
  const modality  = prog0.modality || '—';
  const level     = prog0.level || '—';
  const duration  = prog0.duration || '—';
  const deadline  = prog0.academic_period?.registration_end_date || prog0.academic_period?.application_deadline || data?.academic_period?.application_deadline || '—';

  return (
    <div className="doc-card" style={{ display: 'flex', flexDirection: 'column', padding: 20, minHeight: 330, border: isFailed ? '1px solid #fecaca' : undefined, background: isFailed ? '#fff5f5' : undefined }}>
      {/* Header Info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, color: isFailed ? '#b91c1c' : 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <School size={14} style={{ color: isFailed ? '#ef4444' : 'var(--text-light)' }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={instName}>{instName}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <FileIcon filename={doc.filename} size={12} />
            <span>{doc.filename} · {formatDate(doc.extraction_timestamp)}</span>
          </div>
        </div>
        <StatusBadge status={doc.status} />
      </div>

      {/* Main Course Title / Error Box */}
      <div style={{ flex: 1, marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: isFailed ? '#991b1b' : 'var(--text)', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', height: 44 }} title={progName}>
          {progName}
        </div>
        {programs.length > 1 && (
          <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--primary-light)', color: 'var(--primary)', padding: '2px 8px', borderRadius: 4, display: 'inline-block', marginTop: 6 }}>
            + {programs.length - 1} more course{programs.length > 2 ? 's' : ''} in document
          </span>
        )}
      </div>

      {isFailed ? (
        /* Error Alert Box for Failed Documents */
        <div style={{ background: '#fee2e2', borderRadius: 6, padding: '12px 14px', border: '1px solid #fca5a5', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#991b1b', marginBottom: 4 }}>
            <AlertTriangle size={14} /> Extraction Error
          </div>
          <div style={{ fontSize: 11, color: '#7f1d1d', lineHeight: 1.4 }}>
            {doc.error_message || 'The AI extraction pipeline was unable to parse program fields from this document. Click Retry to re-process.'}
          </div>
        </div>
      ) : (
        /* Grid Metadata Details (2x2 Aligned) */
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', padding: '12px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 4 }}>
                <GraduationCap size={10} /> Level
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>{level}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 4 }}>
                <MapPin size={10} /> Modality
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>{modality}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={10} /> Duration
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>{duration}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Calendar size={10} /> Deadline
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>{deadline}</div>
            </div>
          </div>

          {/* Highlight cost strip */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tuition Cost</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent-teal)' }}>
              {tuition != null ? formatCurrency(tuition, currency) : '—'}
            </span>
          </div>
        </>
      )}

      {/* Footer controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 'auto', paddingTop: 10, borderTop: isFailed ? '1px solid #fca5a5' : undefined }}>
        <div style={{ flex: 1 }}>
          <ConfidenceBar score={doc.confidence_score} />
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {(isFailed || doc.status === 'rejected') && onRetry && (
            <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', padding: '6px 10px', fontSize: 12, border: '1px solid var(--border)' }}
              title="Re-run extraction pipeline using original S3 document"
              onClick={() => onRetry(doc)}>
              <RotateCw size={13} /> Retry
            </button>
          )}

          {doc.status === 'pending_review' && onReview && (
            <button className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', padding: '6px 12px', fontSize: 12 }}
              onClick={() => onReview(doc)}>
              <Eye size={13} /> Review
            </button>
          )}

          {isFailed && onDelete && (
            <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', padding: '6px 8px', color: '#dc2626', border: '1px solid #fca5a5', background: '#fef2f2' }}
              title="Delete failed document card (S3 file remains safe)"
              onClick={() => onDelete(doc)}>
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
