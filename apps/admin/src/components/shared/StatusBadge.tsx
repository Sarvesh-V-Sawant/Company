import { Badge } from '@components/ui/badge';

type StatusKey = string;

const variantMap: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'orange' | 'muted' | 'default'> = {
  present: 'success', 'checked-in': 'success', active: 'success', approved: 'success', finalised: 'success',
  'half-day': 'warning', pending: 'warning', draft: 'warning',
  absent: 'danger', rejected: 'danger',
  leave: 'info', holiday: 'purple', revoked: 'orange',
  weekend: 'muted', lwp: 'muted', 'not-applicable': 'muted', cancelled: 'muted', inactive: 'muted', 'checked-out': 'muted', withdrawn: 'muted',
};

const labelMap: Record<string, string> = {
  'half-day': 'Half Day', 'not-applicable': 'N/A', 'checked-in': 'Checked In', 'checked-out': 'Checked Out', lwp: 'LWP', finalised: 'Finalised',
};

export default function StatusBadge({ status }: { status: StatusKey }) {
  const variant = variantMap[status] ?? 'default';
  const label = labelMap[status] ?? (status.charAt(0).toUpperCase() + status.slice(1));
  return <Badge variant={variant}>{label}</Badge>;
}
