import SupportingDocuments from './SupportingDocuments';

export default function ExportApprovals() {
  return (
    <SupportingDocuments
      initialStatus="PENDING_APPROVAL"
      pageTitle="Export Document Approvals"
      pageSubtitle="Review documents assigned to you and complete approval decisions."
      approvalsOnly
    />
  );
}
