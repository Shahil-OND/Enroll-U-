// components/BulkUploadZone.jsx — Multi-file drag & drop bulk uploader (Max 5 files)
import { useState, useRef } from 'react';
import { Layers, CheckCircle, AlertCircle } from 'lucide-react';
import { uploadDocument } from '../services/client';

const TYPES = ['PDF', 'DOCX', 'XLSX', 'PNG', 'JPG', 'TXT'];

export default function BulkUploadZone({ onBulkUploaded }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [result, setResult] = useState(null);
  const inputRef = useRef();

  async function handleBulkUpload(files) {
    if (!files || !files.length) return;
    const fileList = Array.from(files).slice(0, 5); // Limit batch to 5 documents max
    setSelectedFiles(fileList);
    setUploading(true);
    setResult(null);
    setProgress(5);

    try {
      const results = [];
      // Upload each file to S3 in parallel (each triggers Step Functions execution on AWS)
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        setProgress(Math.round(((i + 1) / fileList.length) * 100));
        const res = await uploadDocument(file);
        results.push({
          document_id: res.document_id,
          filename: file.name,
          status: 'processing'
        });
      }

      setResult({ ok: true, message: `✓ Bulk Queued — ${results.length} documents processing in parallel` });
      onBulkUploaded && onBulkUploaded({ documents: results });
    } catch (e) {
      const msg = e?.response?.data?.error || e?.response?.data?.detail || e.message || 'Bulk upload error';
      setResult({ ok: false, message: msg });
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  return (
    <div
      className={`upload-zone ${dragging ? 'drag-over' : ''}`}
      style={{ minHeight: 180, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); handleBulkUpload(e.dataTransfer.files); }}
      onClick={() => !uploading && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.txt"
        onChange={e => handleBulkUpload(e.target.files)}
      />

      <div className="upload-zone-icon" style={{ background: 'var(--status-pending-bg)', color: 'var(--status-pending)' }}>
        <Layers size={24} />
      </div>

      <div className="upload-zone-title">
        {uploading ? `Uploading ${selectedFiles.length} files…` : 'Drop up to 5 files for Bulk Ingestion'}
      </div>
      <div className="upload-zone-sub">
        or <span>click to select multiple files</span> (PDF, XLSX, DOCX, PNG)
      </div>

      <div className="upload-zone-types">
        {TYPES.map(t => <span key={t} className="type-badge">{t}</span>)}
      </div>

      {uploading && (
        <div className="upload-progress" style={{ marginTop: 14 }}>
          <div className="upload-progress-bar" style={{ width: `${progress}%` }} />
        </div>
      )}

      {result && (
        <div style={{
          marginTop: 12,
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 12, fontWeight: 600,
          color: result.ok ? 'var(--accent-green)' : 'var(--status-rejected)',
          background: result.ok ? 'var(--status-approved-bg)' : 'var(--status-rejected-bg)',
          padding: '8px 12px', borderRadius: 'var(--radius-sm)',
        }}>
          {result.ok ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
          {result.message}
        </div>
      )}
    </div>
  );
}
