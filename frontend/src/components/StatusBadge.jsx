// components/StatusBadge.jsx
const LABELS = {
  pending_review: 'Pending Review',
  processing: 'Processing',
  processing_extraction: 'Extracting',
  processing_normalization: 'Normalizing',
  processing_validation: 'Validating',
  approved: 'Approved',
  rejected: 'Rejected',
  failed: 'Failed',
  unknown: 'Unknown',
};

export default function StatusBadge({ status }) {
  const label = LABELS[status] || status;
  return <span className={`status-badge ${status}`}>{label}</span>;
}
