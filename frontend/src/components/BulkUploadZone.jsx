// components/BulkUploadZone.jsx — Multi-file bulk uploader with Standalone & Institution Group support (DPI Requirement 1 & 2)
import { useState, useRef } from 'react';
import { Layers, CheckCircle, AlertCircle, UploadCloud, Users, FileCheck, X, ArrowRight, Loader2 } from 'lucide-react';
import { createBatch, uploadFileToPresignedUrl, startBatch } from '../services/client';

const TYPES = ['PDF', 'DOCX', 'XLSX', 'PNG', 'JPG', 'TXT'];

export default function BulkUploadZone({ onBulkUploaded }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState(''); // 'requesting_urls', 'uploading_s3', 'starting_workflow', 'done'
  const [progress, setProgress] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState([]); // Array of { file, processingMode, institutionName, groupId }
  const [defaultMode, setDefaultMode] = useState('standalone'); // 'standalone' | 'grouped'
  const [defaultInstitution, setDefaultInstitution] = useState('');
  const [result, setResult] = useState(null);
  const inputRef = useRef();

  function handleFileSelect(files) {
    if (!files || !files.length) return;
    const fileList = Array.from(files).slice(0, 5); // Limit batch to 5 documents max
    const newItems = fileList.map((file, idx) => ({
      id: `${file.name}-${idx}-${Date.now()}`,
      file,
      processingMode: defaultMode,
      institutionName: defaultMode === 'grouped' ? (defaultInstitution || 'Institution Group 1') : '',
      groupId: defaultMode === 'grouped' ? 'grp_1' : null
    }));
    setSelectedFiles(newItems);
    setResult(null);
  }

  function updateItemMode(id, mode) {
    setSelectedFiles(prev => prev.map(item => {
      if (item.id === id) {
        return {
          ...item,
          processingMode: mode,
          institutionName: mode === 'grouped' ? (item.institutionName || defaultInstitution || 'Institution Group 1') : '',
          groupId: mode === 'grouped' ? (item.groupId || 'grp_1') : null
        };
      }
      return item;
    }));
  }

  function updateItemInstitution(id, name) {
    setSelectedFiles(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, institutionName: name };
      }
      return item;
    }));
  }

  function applyGroupToAll(name) {
    setDefaultInstitution(name);
    setSelectedFiles(prev => prev.map(item => ({
      ...item,
      processingMode: 'grouped',
      institutionName: name,
      groupId: 'grp_1'
    })));
    setDefaultMode('grouped');
  }

  function removeFile(id) {
    setSelectedFiles(prev => prev.filter(item => item.id !== id));
  }

  function clearAll() {
    setSelectedFiles([]);
    setResult(null);
    setProgress(0);
    setUploadStep('');
  }

  async function executeDirectS3BatchUpload() {
    if (!selectedFiles.length) return;
    setUploading(true);
    setResult(null);
    setProgress(5);
    setUploadStep('Requesting presigned S3 upload URLs…');

    try {
      // 1. Prepare batch manifest
      const filesPayload = selectedFiles.map(item => ({
        filename: item.file.name,
        contentType: item.file.type || 'application/octet-stream',
        processingMode: item.processingMode || 'standalone',
        institutionName: item.processingMode === 'grouped' ? (item.institutionName || 'Institution Group 1') : null,
        groupId: item.processingMode === 'grouped' ? (item.groupId || 'grp_1') : null
      }));

      // 2. Request batch & presigned URLs from Batch Lambda
      const batchRes = await createBatch(filesPayload);
      const batchId = batchRes.batchId;
      const documents = batchRes.documents || [];

      // 3. Upload files directly to S3 via presigned PUT URLs (Document content NEVER passes through API Gateway / Lambda)
      setUploadStep(`Uploading ${documents.length} files directly to S3…`);
      for (let i = 0; i < documents.length; i++) {
        const docInfo = documents[i];
        const matchedItem = selectedFiles.find(sf => sf.file.name === docInfo.filename) || selectedFiles[i];
        const fileObj = matchedItem.file;

        await uploadFileToPresignedUrl(
          docInfo.uploadUrl,
          fileObj,
          docInfo.contentType,
          (filePct) => {
            const overallPct = Math.round(((i + (filePct / 100)) / documents.length) * 80) + 10;
            setProgress(overallPct);
          }
        );
      }

      // 4. Trigger Batch Workflow execution
      setUploadStep('Starting EnrollUBatchWorkflow execution…');
      setProgress(95);
      await startBatch(batchId);

      setProgress(100);
      setUploadStep('done');
      const successMsg = `✓ Batch Queued (ID: ${batchId.slice(0, 8)}…) — ${documents.length} documents processing (${batchRes.groupsCount || 0} group(s), ${batchRes.standaloneCount || 0} standalone)`;
      setResult({ ok: true, message: successMsg });

      onBulkUploaded && onBulkUploaded({
        batchId: batchId,
        documents: documents.map(d => ({
          document_id: d.documentId,
          filename: d.filename,
          processing_mode: d.processingMode,
          group_id: d.groupId,
          institution_name: d.institutionName,
          status: 'processing'
        })),
        groups: batchRes.groups || []
      });

    } catch (e) {
      console.error(e);
      const msg = e?.response?.data?.error || e?.response?.data?.detail || e.message || 'Batch upload failed';
      setResult({ ok: false, message: msg });
      setUploadStep('');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Drag & Drop Zone */}
      {selectedFiles.length === 0 ? (
        <div
          className={`upload-zone ${dragging ? 'drag-over' : ''}`}
          style={{ minHeight: 180, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); handleFileSelect(e.dataTransfer.files); }}
          onClick={() => !uploading && inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.txt"
            onChange={e => handleFileSelect(e.target.files)}
          />

          <div className="upload-zone-icon" style={{ background: 'var(--status-pending-bg)', color: 'var(--status-pending)' }}>
            <Layers size={24} />
          </div>

          <div className="upload-zone-title">
            Drop up to 5 files for Batch Ingestion
          </div>
          <div className="upload-zone-sub">
            or <span>click to select multiple files</span> (PDF, XLSX, DOCX, PNG)
          </div>

          <div className="upload-zone-types">
            {TYPES.map(t => <span key={t} className="type-badge">{t}</span>)}
          </div>
        </div>
      ) : (
        /* Selected Files & Institution Group Assignment Card */
        <div style={{
          background: 'var(--surface-alt)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}>
          {/* Header & Global Group Controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Layers size={18} style={{ color: 'var(--primary)' }} />
              <span style={{ fontWeight: 700, fontSize: 14 }}>
                Selected Files ({selectedFiles.length}/5)
              </span>
            </div>
            {!uploading && (
              <button
                type="button"
                onClick={clearAll}
                className="btn btn-ghost btn-sm"
                style={{ fontSize: 11, padding: '4px 8px', color: '#ef4444' }}
              >
                Clear All
              </button>
            )}
          </div>

          {/* Quick Preset: Group all under an institution */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)',
            padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)'
          }}>
            <Users size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Quick Assign All:</span>
            <input
              type="text"
              placeholder="e.g. Tecnológico de Monterrey"
              value={defaultInstitution}
              onChange={e => setDefaultInstitution(e.target.value)}
              disabled={uploading}
              style={{
                flexGrow: 1, height: 28, fontSize: 12, border: '1px solid var(--border)',
                borderRadius: 4, padding: '0 8px', outline: 'none'
              }}
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!defaultInstitution.trim() || uploading}
              onClick={() => applyGroupToAll(defaultInstitution.trim())}
              style={{ fontSize: 11, height: 28, padding: '0 10px', background: 'var(--primary-light)', color: 'var(--primary)' }}
            >
              Group All
            </button>
          </div>

          {/* File Items List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
            {selectedFiles.map((item, idx) => (
              <div
                key={item.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: 'var(--surface)', padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)'
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', width: 18 }}>
                  #{idx + 1}
                </div>
                <div style={{ flexGrow: 1, minWidth: 120 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.file.name}>
                    {item.file.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {(item.file.size / 1024).toFixed(1)} KB
                  </div>
                </div>

                {/* Mode Selector */}
                <select
                  value={item.processingMode}
                  onChange={e => updateItemMode(item.id, e.target.value)}
                  disabled={uploading}
                  style={{
                    fontSize: 11, fontWeight: 600, height: 26, padding: '0 6px',
                    borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface-alt)'
                  }}
                >
                  <option value="standalone">Standalone</option>
                  <option value="grouped">Institution Group</option>
                </select>

                {/* Group Name input if grouped */}
                {item.processingMode === 'grouped' && (
                  <input
                    type="text"
                    placeholder="Institution name..."
                    value={item.institutionName}
                    onChange={e => updateItemInstitution(item.id, e.target.value)}
                    disabled={uploading}
                    style={{
                      width: 140, height: 26, fontSize: 11, border: '1px solid var(--border)',
                      borderRadius: 4, padding: '0 6px', outline: 'none'
                    }}
                  />
                )}

                {/* Remove button */}
                {!uploading && (
                  <button
                    type="button"
                    onClick={() => removeFile(item.id)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2 }}
                    title="Remove"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Action Button: Direct S3 Presigned Upload & Start Workflow */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={uploading || selectedFiles.length === 0}
              onClick={executeDirectS3BatchUpload}
              style={{ width: '100%', justifyContent: 'center', height: 38, fontSize: 13, fontWeight: 700 }}
            >
              {uploading ? (
                <>
                  <Loader2 size={16} className="spin" />
                  <span>{uploadStep || 'Processing Batch…'}</span>
                </>
              ) : (
                <>
                  <UploadCloud size={16} />
                  <span>Upload & Start Batch Processing ({selectedFiles.length} files)</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Progress Bar */}
      {uploading && (
        <div className="upload-progress" style={{ marginTop: 4 }}>
          <div className="upload-progress-bar" style={{ width: `${progress}%` }} />
        </div>
      )}

      {/* Status Result */}
      {result && (
        <div style={{
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
