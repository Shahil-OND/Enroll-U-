// pages/Dashboard.jsx — Stats + recent activity
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocumentContext } from '../context/DocumentContext';
import DocumentCard from '../components/DocumentCard';
import { deleteDoc, reprocessDoc } from '../services/client';
import { FolderOpen, BarChart3, TrendingUp, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

function StatCard({ label, value, className = '' }) {
  return (
    <div className="stat-card">
      <div className="stat-card-label">{label}</div>
      <div className={`stat-card-value ${className}`}>{value}</div>
    </div>
  );
}

export default function Dashboard() {
  const { stats, documents, refresh } = useDocumentContext();
  const navigate = useNavigate();
  const [toast, setToast] = useState(null);
  const [deletingDoc, setDeletingDoc] = useState(null);
  const [retryingDoc, setRetryingDoc] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const recent = (documents || []).slice(0, 6);

  function showNotification(message, type = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  async function confirmRetry() {
    if (!retryingDoc || isSubmitting) return;
    const target = retryingDoc;
    setIsSubmitting(true);
    try {
      showNotification(`Triggering reprocessing for ${target.filename}…`, 'info');
      await reprocessDoc(target.document_id);
      showNotification(`Reprocessing started for ${target.filename}`, 'success');
      setRetryingDoc(null);
      refresh();
    } catch (e) {
      console.error(e);
      showNotification(`Failed to retry ${target.filename}: ${e.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!deletingDoc || isSubmitting) return;
    const target = deletingDoc;
    setIsSubmitting(true);
    try {
      await deleteDoc(target.document_id);
      showNotification(`Document card ${target.filename} removed. File preserved in S3.`, 'success');
      setDeletingDoc(null);
      refresh();
    } catch (e) {
      console.error(e);
      showNotification(`Failed to delete document: ${e.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, position: 'relative' }}>
      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: toast.type === 'error' ? '#ef4444' : toast.type === 'info' ? '#3b82f6' : '#10b981',
          color: 'white', padding: '12px 18px', borderRadius: 8,
          boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
          display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13
        }}>
          {toast.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle size={16} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingDoc && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9998,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
        }}>
          <div style={{
            background: 'white', borderRadius: 12, padding: 24, maxWidth: 440, width: '100%',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 18, color: 'var(--text)' }}>Remove Failed Document Card?</h3>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 20 }}>
              Are you sure you want to remove the failed card for <strong>{deletingDoc.filename}</strong> from your review workspace? 
              <br /><br />
              <span style={{ fontSize: 12, color: '#059669', background: '#ecfdf5', padding: '6px 10px', borderRadius: 6, display: 'inline-block' }}>
                ✓ Note: The original uploaded file will remain safely preserved in S3.
              </span>
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-ghost btn-sm" disabled={isSubmitting} onClick={() => setDeletingDoc(null)}>
                Cancel
              </button>
              <button className="btn btn-sm" disabled={isSubmitting} style={{ background: '#dc2626', color: 'white', display: 'flex', alignItems: 'center', gap: 6 }} onClick={confirmDelete}>
                {isSubmitting && <Loader2 className="animate-spin" size={14} />}
                Yes, Remove Card
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Retry Confirmation Modal */}
      {retryingDoc && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9998,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
        }}>
          <div style={{
            background: 'white', borderRadius: 12, padding: 24, maxWidth: 460, width: '100%',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 18, color: 'var(--text)' }}>Re-process Document Pipeline?</h3>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 20 }}>
              Do you want to re-run AI extraction for <strong>{retryingDoc.filename}</strong>? 
              <br /><br />
              This will send the document back through the full workflow:
              <br />
              <span style={{ fontSize: 12, color: 'var(--primary)', background: 'var(--primary-light)', padding: '6px 10px', borderRadius: 6, display: 'inline-block', marginTop: 6 }}>
                1. Text Extraction → 2. Bedrock Normalization → 3. Rule Validation
              </span>
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-ghost btn-sm" disabled={isSubmitting} onClick={() => setRetryingDoc(null)}>
                Cancel
              </button>
              <button className="btn btn-primary btn-sm" disabled={isSubmitting} style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={confirmRetry}>
                {isSubmitting && <Loader2 className="animate-spin" size={14} />}
                Start Reprocessing
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="page-heading" style={{ marginBottom: 0 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BarChart3 size={24} style={{ color: 'var(--primary)' }} /> Dashboard
        </h1>
        <p>Overview of your document processing pipeline and live operations</p>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <StatCard label="Total Documents" value={stats?.total ?? '—'} />
        <StatCard label="Pending Review" value={stats?.pending_review ?? '—'} className="amber" />
        <StatCard label="Processing"     value={stats?.processing ?? '—'}     className="blue" />
        <StatCard label="Approved"       value={stats?.approved ?? '—'}       className="green" />
        <StatCard label="Rejected"       value={stats?.rejected ?? '—'}       className="red" />
        <StatCard label="Avg Confidence" value={stats ? `${(stats.avg_confidence * 100).toFixed(0)}%` : '—'} className="blue" />
      </div>

      {/* Recent documents */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <TrendingUp size={18} style={{ color: 'var(--text-muted)' }} />
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--text)' }}>Recent Operations</h2>
        </div>

        {recent.length === 0 ? (
          <div className="empty-state" style={{ padding: '64px 32px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
            <FolderOpen size={48} style={{ color: 'var(--text-light)', marginBottom: 12 }} />
            <h3>No documents yet</h3>
            <p>Upload a document from the Upload Document section to start the extraction pipeline.</p>
          </div>
        ) : (
          <div className="card-grid">
            {recent.map(doc => (
              <DocumentCard
                key={doc.document_id}
                doc={doc}
                onReview={d => navigate(`/review/${d.document_id}`, { state: { from: '/' } })}
                onDelete={d => setDeletingDoc(d)}
                onRetry={d => setRetryingDoc(d)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
