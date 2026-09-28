import { Badge } from '@components/ui/badge';

type StatusKey = string;

const variantMap: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'orange' | 'muted' | 'default'> = {
  present: 'success', 'checked-in': 'success', active: 'success', approved: 'success', finalised: 'success',
  'half-day': 'warning', pending: 'warning', draft: 'warning',
  absent: 'danger', rejected: 'danger',
  leave: 'info', holiday: 'purple', revoked: 'orange',
  weekend: 'muted', lwp: 'muted', 'not-applicable': 'muted', cancelled: 'muted', inactive: 'muted', 'checked-out': 'muted', withdrawn: 'muted',

  // ─── Phase 30.02+ chain statuses (additive; UPPER_SNAKE cannot collide
  // with the lowercase attendance/payroll keys above) ───
  PO_RECEIVED: 'info',
  UNDER_REVIEW: 'warning',
  ALTERED: 'warning',
  PENDING_INTERNAL_APPROVAL: 'warning',
  SENT_TO_MANUFACTURER: 'info',
  AWAITING_TAX_INVOICE: 'warning',
  TAX_INVOICE_RECEIVED: 'info',
  UPLOADED_ON_PORTAL: 'info',
  PORTAL_APPROVED: 'success',
  REJECTED_ON_PORTAL: 'danger',
  SO_RECEIVED: 'success',
  IN_TRANSIT: 'purple',
  DELIVERED: 'success',
  PARTIALLY_DELIVERED: 'orange',
  SHORT_SUPPLIED: 'orange',
  PAYMENT_PENDING: 'warning',
  PAYMENT_RECEIVED: 'success',
  COMMISSION_RAISED: 'info',
  COMMISSION_RECEIVED: 'success',
  CLOSED: 'muted',
  ON_HOLD: 'orange',
  CANCELLED: 'muted',

  // Email delivery states used by the Work Desk outbox
  sent: 'success', queued: 'info', failed: 'danger', bounced: 'danger',
  paid: 'success', partial: 'warning',
};

const labelMap: Record<string, string> = {
  'half-day': 'Half Day', 'not-applicable': 'N/A', 'checked-in': 'Checked In', 'checked-out': 'Checked Out', lwp: 'LWP', finalised: 'Finalised',

  // Chain statuses read better in sentence case than as raw enum names.
  PO_RECEIVED: 'PO Received',
  UNDER_REVIEW: 'Under Review',
  ALTERED: 'Altered',
  PENDING_INTERNAL_APPROVAL: 'Pending Approval',
  SENT_TO_MANUFACTURER: 'Sent to Manufacturer',
  AWAITING_TAX_INVOICE: 'Awaiting Tax Invoice',
  TAX_INVOICE_RECEIVED: 'Tax Invoice Received',
  UPLOADED_ON_PORTAL: 'Uploaded on Portal',
  PORTAL_APPROVED: 'Portal Approved',
  REJECTED_ON_PORTAL: 'Rejected on Portal',
  SO_RECEIVED: 'SO Received',
  IN_TRANSIT: 'In Transit',
  DELIVERED: 'Delivered',
  PARTIALLY_DELIVERED: 'Partially Delivered',
  SHORT_SUPPLIED: 'Short Supplied',
  PAYMENT_PENDING: 'Payment Pending',
  PAYMENT_RECEIVED: 'Payment Received',
  COMMISSION_RAISED: 'Commission Raised',
  COMMISSION_RECEIVED: 'Commission Received',
  CLOSED: 'Closed',
  ON_HOLD: 'On Hold',
  CANCELLED: 'Cancelled',
};

export default function StatusBadge({ status }: { status: StatusKey }) {
  const variant = variantMap[status] ?? 'default';
  const label = labelMap[status] ?? (status.charAt(0).toUpperCase() + status.slice(1));
  return <Badge variant={variant}>{label}</Badge>;
}
