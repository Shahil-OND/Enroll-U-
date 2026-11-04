// pages/UploadPage.jsx — Ingestion & raw text extractor preview with Bulk Processing support
import { AlertCircle, ArrowRight, CheckCircle, Clock, Cpu, FileText, Layers, Loader2, RefreshCw, Search, UploadCloud, Users, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileIcon } from '../components/DocumentCard';
import UploadZone from '../components/UploadZone';
import BulkUploadZone from '../components/BulkUploadZone';
import { getDocument, getBatch, pasteText, reprocessDoc } from '../services/client';

export default function UploadPage() {
  const [uploadedId, setUploadedId] = useState(() => sessionStorage.getItem('last_uploaded_id') || null);
  const [doc, setDoc] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const navigate = useNavigate();

  const [pastedText, setPastedText] = useState('');
  const [pasting, setPasting] = useState(false);
  const [pastingError, setPastingError] = useState(null);

  // ── Bulk Processing & Batch State ──────────────────────────────────────────
  const [bulkDocs, setBulkDocs] = useState([]); // [{ document_id, filename, status, error_message, processing_mode, group_id }]
  const [activeBatchId, setActiveBatchId] = useState(null);
  const [batchInfo, setBatchInfo] = useState(null);

  function handleUploaded(data) {
    if (data?.document_id) {
      sessionStorage.setItem('last_uploaded_id', data.document_id);
    }
    setUploadedId(data.document_id);
    setDoc(null);
    setErrorMsg(null);
    setBulkDocs([]);
    setActiveBatchId(null);
    setBatchInfo(null);
    setActiveBatchId(null);
    setBatchInfo(null);
  }

  function handleBulkUploaded(data) {
    if (data?.documents && data.documents.length) {
      const initialDocs = data.documents.map(d => ({
        document_id: d.document_id,
        filename: d.filename,
        processing_mode: d.processing_mode || 'standalone',
        group_id: d.group_id,
        institution_name: d.institution_name,
        status: d.status || 'processing',
        error_message: null
      }));
      setBulkDocs(initialDocs);
      setUploadedId(null);
    }
    if (data?.batchId) {
      setActiveBatchId(data.batchId);
    }
  }

  async function handlePasteSubmit() {
    if (!pastedText.trim()) return;
    setPasting(true);
    setPastingError(null);
    try {
      const data = await pasteText(pastedText);
      handleUploaded(data);
    } catch (e) {
      const msg = e?.response?.data?.detail || e.message || 'Pasted text ingestion failed';
      setPastingError(msg);
    } finally {
      setPasting(false);
    }
  }

  async function handleReprocess() {
    if (!uploadedId) return;
    try {
      setErrorMsg(null);
      await reprocessDoc(uploadedId);
      setDoc(prev => prev ? { ...prev, status: 'processing' } : null);
    } catch (e) {
      console.error(e);
      setErrorMsg(e?.response?.data?.error || 'Reprocess failed');
    }
  }

  // Poll single document staging record status
  useEffect(() => {
    if (!uploadedId) return;
    let active = true;

    const poll = async () => {
      try {
        const d = await getDocument(uploadedId);
        if (!active) return;
        setDoc(d);
        if (d.status === 'failed') {
          setErrorMsg(d.error_message || 'Pipeline failed during normalization.');
        }
        if (['pending_review', 'approved', 'rejected', 'failed'].includes(d.status)) {
          active = false;
        }
      } catch (e) {
        console.error(e);
      }
    };

    poll();
    const intervalId = setInterval(poll, 1500);

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [uploadedId]);

  // Poll bulk document batch statuses & batch progress
  useEffect(() => {
    if (!bulkDocs || !bulkDocs.length) return;
    let active = true;

    const pollBulk = async () => {
      try {
        if (activeBatchId) {
          try {
            const bInfo = await getBatch(activeBatchId);
            if (active && bInfo) {
              setBatchInfo(bInfo);
            }
          } catch (bErr) {
            console.error('Batch progress fetch error:', bErr);
          }
        }

        const updatedDocs = await Promise.all(
          bulkDocs.map(async (item) => {
            if (['pending_review', 'partial', 'approved', 'rejected', 'failed'].includes(item.status)) {
              return item;
            }
            try {
              const res = await getDocument(item.document_id);
              return {
                ...item,
                status: res.status,
                filename: res.filename || item.filename,
                error_message: res.error_message,
                processing_mode: res.processing_mode || item.processing_mode,
                group_id: res.groupId || res.group_id || item.group_id,
                institution_name: res.institutionName || res.institution_name || item.institution_name
              };
            } catch (err) {
              return item;
            }
          })
        );

        if (!active) return;
        setBulkDocs(updatedDocs);

        const allFinished = updatedDocs.every(d =>
          ['pending_review', 'partial', 'approved', 'rejected', 'failed'].includes(d.status)
        );
        if (allFinished && (!activeBatchId || (batchInfo && ['completed', 'completed_with_errors', 'failed'].includes(batchInfo.overallBatchStatus)))) {
          active = false;
        }
      } catch (e) {
        console.error(e);
      }
    };

    pollBulk();
    const intervalId = setInterval(pollBulk, 2000);

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [bulkDocs.length, activeBatchId, bulkDocs.map(d => d.status).join(','), batchInfo?.overallBatchStatus]);

  const steps = [
    { icon: <UploadCloud size={22} style={{ color: 'var(--primary)' }} />, step: '1. Ingest', desc: 'Upload brochure files' },
    { icon: <Search size={22} style={{ color: 'var(--accent-teal)' }} />, step: '2. OCR Extract', desc: 'OCR reads raw text layout' },
    { icon: <Cpu size={22} style={{ color: 'var(--secondary)' }} />, step: '3. LLM Normalize', desc: 'AI structures program cost schema' },
    { icon: <CheckCircle size={22} style={{ color: 'var(--accent-green)' }} />, step: '4. Operator Review', desc: 'Human review and approval' },
  ];

  function resetUploader() {
    sessionStorage.removeItem('last_uploaded_id');
    setUploadedId(null);
    setDoc(null);
    setErrorMsg(null);
    setPastedText('');
    setPastingError(null);
    setBulkDocs([]);
    setActiveBatchId(null);
    setBatchInfo(null);
  }

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {!uploadedId && (!bulkDocs || !bulkDocs.length) ? (
        <>
          <div className="page-heading" style={{ textAlign: 'center', marginBottom: 8 }}>
            <h1 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <UploadCloud size={26} style={{ color: 'var(--primary)' }} /> Ingest Document Brochure
            </h1>
            <p style={{ maxWidth: 640, margin: '6px auto 0' }}>
              Upload any educational brochure, spreadsheet, or image. Choose single upload, bulk batch upload (MaxConcurrency: 3), or paste raw text.
            </p>
          </div>

          {/* Option A: Full Width Primary Card */}
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: 24,
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <UploadCloud size={20} style={{ color: 'var(--primary)' }} />
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Option A: Single File Ingestion</h3>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                Upload an individual brochure, schedule, or image file (PDF, XLS, XLSX, JPG, PNG).
              </p>
            </div>
            <UploadZone onUploaded={handleUploaded} />
          </div>

          {/* Option B & Option C Grid (Height Aligned) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: 24, alignItems: 'stretch' }}>
            {/* Option B: Bulk Upload Card */}
            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: 24,
              boxShadow: 'var(--shadow-sm)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Layers size={20} style={{ color: 'var(--status-pending)' }} />
                  <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Option B: Bulk Document Ingestion</h3>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                  Upload up to 5 files at once. Each document processes through Step Functions in parallel.
                </p>
              </div>
              <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <BulkUploadZone onBulkUploaded={handleBulkUploaded} />
              </div>
            </div>

            {/* Option C: Paste Raw Text Card */}
            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: 24,
              boxShadow: 'var(--shadow-sm)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <FileText size={20} style={{ color: 'var(--secondary)' }} />
                  <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Option C: Paste Raw Text or Chat</h3>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                  Paste raw program details, email bodies, or WhatsApp logs for instant schema analysis.
                </p>
              </div>
              <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <textarea
                  style={{
                    width: '100%',
                    height: '100%',
                    minHeight: 140,
                    flexGrow: 1,
                    background: '#f8f9fb',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    padding: 12,
                    fontSize: 13,
                    fontFamily: 'var(--font)',
                    color: 'var(--text)',
                    resize: 'none',
                    outline: 'none',
                    lineHeight: 1.5,
                  }}
                  placeholder={`Example:\n- Inscripción: $7,160.00 pesos en septiembre\n- Colegiatura de $5,000.00 pagando del 1 al 10 de cada mes\n- Plan de estudios: Ingeniería en Sistemas`}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  disabled={pasting}
                />
                {pastingError && (
                  <div style={{ color: 'var(--status-rejected)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertCircle size={14} />
                    <span>{pastingError}</span>
                  </div>
                )}
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center', height: 40, flexShrink: 0 }}
                  onClick={handlePasteSubmit}
                  disabled={pasting || !pastedText.trim()}
                >
                  {pasting ? (
                    <>
                      <Loader2 className="animate-spin" size={16} />
                      <span>Ingesting Text...</span>
                    </>
                  ) : (
                    <>
                      <Cpu size={16} />
                      <span>Analyze Pasted Text</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 24, boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ fontWeight: 700, marginBottom: 16, fontSize: 15, color: 'var(--text)', textAlign: 'center' }}>
              Ingestion & Normalization Workflow
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
              {steps.map(s => (
                <div key={s.step} style={{
                  textAlign: 'center',
                  padding: '16px 12px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)'
                }}>
                  <div style={{
                    width: 44,
                    height: 44,
                    background: 'var(--surface)',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 12px',
                    boxShadow: 'var(--shadow-sm)'
                  }}>
                    {s.icon}
                  </div>
                  <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 13, color: 'var(--text)' }}>{s.step}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5 }}>{s.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : bulkDocs && bulkDocs.length ? (
        /* ── Operator Bulk Batch Status Tracker Panel ────────────────────────── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
            padding: 24, boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Layers size={22} style={{ color: 'var(--primary)' }} /> Bulk Batch Processing Status
                </h2>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                  Processing {bulkDocs.length} documents in Step Functions Map State (MaxConcurrency: 3).
                </p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={resetUploader}>
                <RefreshCw size={14} /> Start New Upload
              </button>
            </div>

            {/* Operator Document Status List */}
            <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '40px 1fr 180px 140px', padding: '12px 16px',
                background: 'var(--bg)', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)'
              }}>
                <div>State</div>
                <div>Document Name</div>
                <div>Processing Status</div>
                <div style={{ textAlign: 'right' }}>Action</div>
              </div>

              {bulkDocs.map((item, idx) => {
                const isReady = item.status === 'pending_review' || item.status === 'approved';
                const isPartial = item.status === 'partial';
                const isProcessing = ['processing', 'uploaded', 'processing_extraction', 'processing_normalization', 'processing_validation'].includes(item.status);
                const isFailed = item.status === 'failed';

                return (
                  <div key={item.document_id || idx} style={{
                    display: 'grid', gridTemplateColumns: '40px 1fr 180px 140px', padding: '14px 16px',
                    alignItems: 'center', borderBottom: idx < bulkDocs.length - 1 ? '1px solid var(--border)' : 'none',
                    background: 'var(--surface)', fontSize: 13
                  }}>
                    {/* State Icon */}
                    <div>
                      {isReady && <CheckCircle size={18} style={{ color: 'var(--accent-green)' }} />}
                      {isPartial && <Clock size={18} style={{ color: 'var(--status-pending)' }} />}
                      {isProcessing && <Loader2 className="animate-spin" size={18} style={{ color: 'var(--primary)' }} />}
                      {isFailed && <XCircle size={18} style={{ color: 'var(--status-rejected)' }} />}
                    </div>

                    {/* Document Name & Group Tag */}
                    <div style={{ fontWeight: 600, color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FileIcon filename={item.filename} size={18} />
                        <span>{item.filename}</span>
                      </div>
                      {item.processing_mode === 'grouped' && (
                        <div style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 500, paddingLeft: 26 }}>
                          Institution Group: {item.institution_name || item.group_id}
                        </div>
                      )}
                    </div>

                    {/* Processing Status Badge */}
                    <div>
                      {isReady && (
                        <span className="badge badge-approved" style={{ fontSize: 11, padding: '4px 8px' }}>
                          ✓ Ready for Review
                        </span>
                      )}
                      {isPartial && (
                        <span className="badge badge-pending" style={{ fontSize: 11, padding: '4px 8px', background: '#fef3c7', color: '#92400e' }}>
                          ⏳ Partial (Awaiting Group Consolidation)
                        </span>
                      )}
                      {isProcessing && (
                        <span className="badge badge-pending" style={{ fontSize: 11, padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <Loader2 className="animate-spin" size={12} /> Processing
                        </span>
                      )}
                      {isFailed && (
                        <span className="badge badge-rejected" style={{ fontSize: 11, padding: '4px 8px' }}>
                          ✗ Failed
                        </span>
                      )}
                    </div>

                    {/* Action Button */}
                    <div style={{ textAlign: 'right' }}>
                      {isReady && (
                        <button
                          className="btn btn-primary btn-sm"
                          style={{ fontSize: 12, padding: '4px 10px' }}
                          onClick={() => navigate(`/review/${item.document_id}`)}
                        >
                          Review <ArrowRight size={12} />
                        </button>
                      )}
                      {isPartial && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          In Group Workflow
                        </span>
                      )}
                      {isFailed && (
                        <span style={{ fontSize: 11, color: 'var(--status-rejected)' }}>
                          {item.error_message ? item.error_message.slice(0, 30) + '…' : 'Error'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Institution Groups & Consolidation Summary (DPI Requirement 8 & 9) */}
            {batchInfo?.institutionGroups && batchInfo.institutionGroups.length > 0 && (
              <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Users size={18} style={{ color: 'var(--primary)' }} /> Institution Groups Consolidation
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {batchInfo.institutionGroups.map((grp) => {
                    const isConsolidated = Boolean(grp.consolidatedDocumentId);
                    return (
                      <div
                        key={grp.groupId}
                        style={{
                          background: 'var(--surface-alt)', border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-md)', padding: '14px 18px',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                            {grp.institutionName || grp.groupId}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                            {grp.documents?.length || 0} documents in group • Status: <strong style={{ textTransform: 'capitalize' }}>{grp.status}</strong>
                          </div>
                        </div>

                        <div>
                          {isConsolidated ? (
                            <button
                              className="btn btn-primary btn-sm"
                              style={{ fontSize: 12, padding: '6px 14px', background: 'var(--accent-green)', borderColor: 'var(--accent-green)' }}
                              onClick={() => navigate(`/review/${grp.consolidatedDocumentId}`)}
                            >
                              Review Consolidated Record <ArrowRight size={13} />
                            </button>
                          ) : (
                            <span className="badge badge-pending" style={{ fontSize: 11, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <Loader2 className="animate-spin" size={12} /> Consolidating Group…
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ── Single Document Active Status Panel ────────────────────────── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
            padding: 24, boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <FileIcon filename={doc?.filename || 'brochure'} size={24} />
                <div>
                  <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text)' }}>{doc?.filename || 'Uploading Brochure...'}</h2>
                  <p style={{ fontSize: 12, color: 'var(--text-light)', margin: '4px 0 0' }}>
                    Staging ID: {uploadedId.slice(0, 12)}…
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button className="btn btn-ghost btn-sm" onClick={resetUploader}>
                  <RefreshCw size={12} /> Upload Another File
                </button>
                {doc?.status === 'pending_review' && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => navigate(`/review/${uploadedId}`, { state: { from: '/upload' } })}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    Proceed to Review <ArrowRight size={14} />
                  </button>
                )}
              </div>
            </div>
            {/* Stepper Status Indicators */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, paddingTop: 16,
              borderTop: '1px solid var(--border)', fontSize: 13, color: 'var(--text-muted)', fontWeight: 500
            }}>
              {(() => {
                const status = doc?.status || 'unknown';
                if (status === 'processing' || status === 'uploaded' || status === 'processing_extraction') {
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Loader2 className="animate-spin" size={16} style={{ color: 'var(--primary)' }} />
                      <span>
                        {doc?.raw_text
                          ? 'Text extracted! Running AI Normalization (Bedrock) & Validation in background...'
                          : 'Processing brochure pipeline (OCR Extraction & AI Normalization)...'}
                      </span>
                    </div>
                  );
                }
                if (status === 'pending_review') {
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent-green)' }}>
                      <CheckCircle size={16} />
                      <span>Orchestrator background tasks completed successfully! Structured schema is ready for review.</span>
                    </div>
                  );
                }
                if (status === 'failed') {
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, color: 'var(--status-rejected)', width: '100%' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <AlertCircle size={16} />
                        <span>Ingestion pipeline failed: {errorMsg || 'Staging script exception.'}</span>
                      </div>
                      <button className="btn btn-secondary btn-sm" onClick={handleReprocess} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', fontSize: 12 }}>
                        <RefreshCw size={13} /> Reprocess
                      </button>
                    </div>
                  );
                }
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Loader2 className="animate-spin" size={16} />
                    <span>Preparing pipeline worker...</span>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Extracted Text Pane */}
          {doc?.raw_text || ['pending_review', 'approved', 'rejected'].includes(doc?.status) ? (
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
              padding: 24, boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: 12
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                <FileText size={18} style={{ color: 'var(--primary)' }} />
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Extracted Raw Text Preview</h3>
                <span style={{ fontSize: 11, color: 'var(--text-light)', marginLeft: 'auto' }}>
                  Characters: {(doc.raw_text || '').length.toLocaleString()} · OCR Method: {doc.extraction_method || '—'}
                </span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                {doc.raw_text
                  ? "Below is the raw text extracted from your document layout. The orchestrator is using this character map in the background to isolate cost variables."
                  : "No digital text could be extracted directly from this document (it may be scanned, an image, or empty)."}
              </p>
              {doc.raw_text && (
                <pre style={{
                  background: '#f8f9fb', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                  padding: 16, fontSize: 12, lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  color: 'var(--text)', fontFamily: '"Fira Code", "Cascadia Code", Consolas, monospace',
                  maxHeight: 480, overflowY: 'auto', margin: 0
                }}>
                  {doc.raw_text}
                </pre>
              )}
            </div>
          ) : (
            doc?.status !== 'failed' && (
              <div style={{
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
                padding: '64px 32px', boxShadow: 'var(--shadow-sm)', textAlign: 'center', color: 'var(--text-muted)'
              }}>
                <Loader2 className="animate-spin" size={36} style={{ color: 'var(--primary)', margin: '0 auto 16px' }} />
                <h3>Extracting Character Layout...</h3>
                <p style={{ fontSize: 13, color: 'var(--text-light)', marginTop: 4 }}>
                  OCR parser is mapping page layout cells. Extracted raw text will render here the instant it is completed.
                </p>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}