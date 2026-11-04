// components/UploadZone.jsx — Drag & drop file uploader
import { useState, useRef } from 'react';
import { Upload, CheckCircle, AlertCircle } from 'lucide-react';
import { uploadDocument } from '../services/client';

const TYPES = ['PDF', 'DOCX', 'XLSX', 'PNG', 'JPG', 'TXT'];

export default function UploadZone({ onUploaded }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null); // { ok, message }
  const inputRef = useRef();

  async function handleFiles(files) {
    if (!files || !files.length) return;
    const file = files[0];
    setUploading(true);
    setResult(null);
    setProgress(0);
    try {
      const data = await uploadDocument(file, setProgress);
      setResult({ ok: true, message: `✓ Queued — ID: ${data.document_id.slice(0, 8)}…` });
      onUploaded && onUploaded(data);
    } catch (e) {
      const msg = e?.response?.data?.error || e?.response?.data?.detail || e.message || 'Upload failed';
      setResult({ ok: false, message: msg });
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  return (
    <div
      className={`upload-zone ${dragging ? 'drag-over' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
      onClick={() => !uploading && inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.txt"
        onChange={e => handleFiles(e.target.files)} />

      <div className="upload-zone-icon">
        <Upload size={26} />
      </div>

      <div className="upload-zone-title">
        {uploading ? 'Uploading…' : 'Drop your document here'}
      </div>
      <div className="upload-zone-sub">
        or <span>click to browse</span> your files
      </div>

      <div className="upload-zone-types">
        {TYPES.map(t => <span key={t} className="type-badge">{t}</span>)}
      </div>

      {uploading && (
        <div className="upload-progress" style={{ marginTop: 20 }}>
          <div className="upload-progress-bar" />
        </div>
      )}

      {result && (
        <div style={{
          marginTop: 16,
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 13, fontWeight: 600,
          color: result.ok ? 'var(--accent-green)' : 'var(--status-rejected)',
          background: result.ok ? 'var(--status-approved-bg)' : 'var(--status-rejected-bg)',
          padding: '10px 16px', borderRadius: 'var(--radius-sm)',
        }}>
          {result.ok ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {result.message}
        </div>
      )}
    </div>
  );
}
