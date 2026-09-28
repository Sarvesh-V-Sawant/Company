/**
 * Operations Work Desk error codes — chain lifecycle (Phases 30.02–30.10).
 *
 * WHY A SEPARATE FILE: `constants/errors.ts` contains no OPS_* codes at all,
 * even though the 30.01 master services already throw OPS_001–OPS_025. It also
 * carries stale AUTH_ and ATT_ descriptions that contradict runtime-proven
 * behaviour (AUTH_006 is a 403 in requireRole.ts, ATT_004 is the office-network
 * rejection). Correcting that file would change strings the mobile app may
 * depend on, so it is deliberately left alone and logged as 30.10 debt.
 *
 * Chain-lifecycle codes start at OPS_030 to leave headroom above the existing
 * master-data range.
 */
export const OPS_CHAIN_ERRORS = {
  OPS_030: 'Invalid chain ID',
  OPS_031: 'Chain not found',
  OPS_032: 'Invalid status transition',
  OPS_033: 'Chain is closed or cancelled and cannot be modified',
  OPS_034: 'Canteen not found or inactive',
  OPS_035: 'Manufacturer not found or inactive',
  OPS_036: 'Address invalid for this canteen',
  OPS_037: 'At least one line item is required',
  OPS_038: 'Duplicate product in line items',
  OPS_039: 'Invalid quantity',
  OPS_040: 'Assignee not found or not permitted to hold chains',
  OPS_041: 'Document not found',
  OPS_042: 'File exceeds the maximum allowed size',
  OPS_043: 'Unsupported file type',
  OPS_044: 'Document storage failure',
  OPS_045: 'At least one recipient email is required',
  OPS_046: 'Email has already been sent',
  OPS_047: 'Email provider rejected the message',
  OPS_048: 'Tax invoice details are required',
  OPS_049: 'A tax invoice must be recorded before portal upload',
  OPS_050: 'Sales order number is required',
  OPS_051: 'Delivered quantity exceeds the altered quantity',
  OPS_052: 'Invalid payment amount',
  OPS_053: 'No applicable commission rule found',
  OPS_054: 'Commission has already been raised',
  OPS_055: 'Commission tax settings are not configured',
  OPS_056: 'Document title settings are not configured',
  OPS_057: 'This chain is not assigned to you',
  OPS_058: 'Line import requires a target chain',
  OPS_059: 'The altered order has not been generated yet',
  OPS_060: 'Hold state change is not valid here',
  OPS_061: 'Line items cannot be edited at this stage',
  OPS_062: 'Chain already exists for this PO number and canteen',
  OPS_063: 'Cannot deactivate — the record is still used by open chains',
  OPS_064: 'A referenced record does not exist or is inactive',
  OPS_065: 'The record changed while you were working — reload and retry',
} as const;

export type OpsChainErrorCode = keyof typeof OPS_CHAIN_ERRORS;

/** Maximum upload size for chain documents (bytes). 15 MB. */
export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

/** Accepted upload MIME types for chain documents. */
export const ALLOWED_DOCUMENT_MIME: readonly string[] = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'image/jpeg',
  'image/png',
  'image/webp',
];
