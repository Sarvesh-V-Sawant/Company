/**
 * Operations Work Desk settings — a SEPARATE singleton from CompanySettings.
 *
 * CompanySettings is deliberately not extended: it holds attendanceValidationMode
 * ('officeIp'), allowedOfficeIps and the geofence, all of which are outside this
 * build's boundary. Keeping ops config in its own collection means an ops
 * settings write can never disturb attendance validation.
 *
 * The two CA-blocked values live here as editable fields rather than hardcoded
 * constants: the legal document title, and commission GST/SAC.
 */
import mongoose, { Document, Schema } from 'mongoose';

export interface IOpsDocumentTitles {
  /** Legal name printed on the altered-order document sent to the manufacturer. */
  alteredOrderTitle: string;
  /** Legal name printed on the commission invoice. */
  commissionInvoiceTitle: string;
  /** Optional declaration/footer line printed under the document. */
  documentFooterNote?: string;
}

export interface IOpsCommissionTax {
  /**
   * Whether GST applies to the commission invoice. Defaults to false so that no
   * tax treatment is ever assumed. The commission invoice refuses to raise
   * (OPS_055) while gstApplicable is true but rate or SAC is missing.
   */
  gstApplicable: boolean;
  gstRatePercent?: number;
  sacCode?: string;
  /** Invoice number prefix, e.g. "GEN/COM". */
  invoiceNumberPrefix: string;
}

export interface IOpsCompanyIdentity {
  legalName?: string;
  gstin?: string;
  addressLines: string[];
  contactEmail?: string;
  contactPhone?: string;
}

export interface IOpsSettings extends Document {
  singletonKey: string;
  documentTitles: IOpsDocumentTitles;
  commissionTax: IOpsCommissionTax;
  companyIdentity: IOpsCompanyIdentity;
  /** Default email subject/body for the altered-order send step. */
  alteredOrderEmailSubject: string;
  alteredOrderEmailBody: string;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const OPS_SETTINGS_KEY = 'ops';

export const DEFAULT_ALTERED_ORDER_SUBJECT =
  'Revised Order {{chainNumber}} — {{canteenName}}';

export const DEFAULT_ALTERED_ORDER_BODY = [
  'Dear {{manufacturerContact}},',
  '',
  'Please find attached the revised order against purchase order {{sourcePoNumber}}',
  'for {{canteenName}}.',
  '',
  'Reference: {{chainNumber}}',
  'Total order value: {{alteredOrderValue}}',
  '',
  'Kindly acknowledge and share the tax invoice against this order.',
  '',
  'Regards,',
  '{{companyLegalName}}',
].join('\n');

const OpsSettingsSchema = new Schema<IOpsSettings>(
  {
    singletonKey: { type: String, required: true, unique: true, default: OPS_SETTINGS_KEY },
    documentTitles: {
      alteredOrderTitle: {
        type: String,
        required: true,
        // Neutral placeholder. The legally correct name is a CA decision and is
        // set by an admin in Ops Settings; nothing here assumes a legal name.
        default: 'Purchase Order — Revised',
      },
      commissionInvoiceTitle: {
        type: String,
        required: true,
        default: 'Commission Invoice',
      },
      documentFooterNote: String,
    },
    commissionTax: {
      gstApplicable: { type: Boolean, required: true, default: false },
      gstRatePercent: Number,
      sacCode: String,
      invoiceNumberPrefix: { type: String, required: true, default: 'GEN/COM' },
    },
    companyIdentity: {
      legalName: String,
      gstin: String,
      addressLines: { type: [String], default: [] },
      contactEmail: String,
      contactPhone: String,
    },
    alteredOrderEmailSubject: { type: String, required: true, default: DEFAULT_ALTERED_ORDER_SUBJECT },
    alteredOrderEmailBody: { type: String, required: true, default: DEFAULT_ALTERED_ORDER_BODY },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export const OpsSettings =
  mongoose.models.OpsSettings ?? mongoose.model<IOpsSettings>('OpsSettings', OpsSettingsSchema);
