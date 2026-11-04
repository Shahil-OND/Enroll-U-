// pages/DocumentsPage.jsx — All documents table view with pagination
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDocuments } from '../services/client';
import StatusBadge from '../components/StatusBadge';
import { FileIcon } from '../components/DocumentCard';
import { ChevronLeft, ChevronRight, Inbox, FileText, Search } from 'lucide-react';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function DocumentsPage() {
  const [docs, setDocs]         = useState([]);
  const [search, setSearch]     = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const navigate = useNavigate();

  async function load() {
    try {
      const data = await getDocuments();
      setDocs(data);
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { const id = setInterval(load, 5000); return () => clearInterval(id); }, []);

  const filtered = docs.filter(d =>
    d.filename?.toLowerCase().includes(search.toLowerCase())
  );

  // Reset page when search term changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedDocs = filtered.slice(startIndex, startIndex + itemsPerPage);

  return (
    <div>
      <div className="page-heading">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText size={24} style={{ color: 'var(--primary)' }} /> All Documents
        </h1>
        <p>Complete operational log and history of all uploaded and parsed brochure documents.</p>
      </div>

      <div className="filter-bar" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }} />
          <input
            className="filter-search"
            placeholder="Search by filename…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 36, width: '100%' }}
          />
        </div>
      </div>

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Filename</th>
              <th>Type</th>
              <th>Institution</th>
              <th>Program</th>
              <th>Status</th>
              <th>Confidence</th>
              <th>Uploaded</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <Inbox size={32} style={{ color: 'var(--text-light)' }} />
                    <span>No documents found</span>
                  </div>
                </td>
              </tr>
            )}
            {paginatedDocs.map(doc => {
              const data = typeof doc.extracted_json === 'string'
                ? (() => { try { return JSON.parse(doc.extracted_json); } catch { return {}; } })()
                : (doc.extracted_json || {});
              const pct = Math.round((doc.confidence_score || 0) * 100);
              const programs = data?.programs || [];
              const firstProgName = programs[0]?.name || '—';
              
              return (
                <tr key={doc.document_id}>
                  <td style={{ maxWidth: 220 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <FileIcon filename={doc.filename} size={15} />
                      <div className="truncate" title={doc.filename} style={{ fontWeight: 600 }}>{doc.filename}</div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-light)', marginLeft: 23 }}>{doc.document_id.slice(0, 8)}…</div>
                  </td>
                  <td><span className="tag" style={{ textTransform: 'uppercase' }}>{doc.document_type || '—'}</span></td>
                  <td className="truncate" style={{ maxWidth: 140 }}>{data?.institution?.name || '—'}</td>
                  <td className="truncate" style={{ maxWidth: 160 }} title={firstProgName}>{firstProgName}</td>
                  <td><StatusBadge status={doc.status} /></td>
                  <td>
                    <span style={{ fontWeight: 700, color: pct >= 75 ? 'var(--accent-green)' : pct >= 45 ? 'var(--status-pending)' : 'var(--status-rejected)' }}>
                      {pct}%
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>{formatDate(doc.extraction_timestamp)}</td>
                  <td>
                    {doc.status === 'pending_review' ? (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => navigate(`/review/${doc.document_id}`, { state: { from: '/documents' } })}
                      >
                        Review
                      </button>
                    ) : (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => navigate(`/review/${doc.document_id}`, { state: { from: '/documents' } })}
                      >
                        View
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, background: 'var(--surface)', padding: '12px 20px', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Showing <strong>{startIndex + 1}</strong> to <strong>{Math.min(startIndex + itemsPerPage, filtered.length)}</strong> of <strong>{filtered.length}</strong> items
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
    </div>
  );
}
