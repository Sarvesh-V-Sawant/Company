/**
 * Ops settings service (Phase 30.04 / 30.08 parameterisation).
 *
 * Holds the two values that were blocked on your CA — the legal document title
 * and the commission GST/SAC treatment — as admin-editable settings rather than
 * hardcoded constants. Nothing here assumes a tax rate or a legal name.
 */
import mongoose from 'mongoose';
import { connectDB } from '@lib/db/connect';
import { AppError } from '@services/AuthService';
import { AuditLog } from '@models/AuditLog';
import {
  OpsSettings,
  OPS_SETTINGS_KEY,
  type IOpsSettings,
} from '@models/ops/OpsSettings';

export interface OpsSettingsUpdate {
  documentTitles?: {
    alteredOrderTitle?: string;
    commissionInvoiceTitle?: string;
    documentFooterNote?: string;
  };
  commissionTax?: {
    gstApplicable?: boolean;
    gstRatePercent?: number;
    sacCode?: string;
    invoiceNumberPrefix?: string;
  };
  companyIdentity?: {
    legalName?: string;
    gstin?: string;
    addressLines?: string[];
    contactEmail?: string;
    contactPhone?: string;
  };
  alteredOrderEmailSubject?: string;
  alteredOrderEmailBody?: string;
}

export class OpsSettingsService {
  /**
   * Returns the singleton, creating it with schema defaults on first access.
   * Uses an upsert so two concurrent first-hits cannot create two documents.
   */
  static async get(): Promise<IOpsSettings> {
    await connectDB();
    const existing = await OpsSettings.findOne({ singletonKey: OPS_SETTINGS_KEY });
    if (existing) return existing;

    await OpsSettings.updateOne(
      { singletonKey: OPS_SETTINGS_KEY },
      { $setOnInsert: { singletonKey: OPS_SETTINGS_KEY } },
      { upsert: true },
    );
    const created = await OpsSettings.findOne({ singletonKey: OPS_SETTINGS_KEY });
    if (!created) throw new AppError('OPS_056', 500, 'Unable to initialise ops settings.');
    return created;
  }

  static async update(data: OpsSettingsUpdate, actorId: string): Promise<IOpsSettings> {
    const settings = await this.get();
    const actorOid = new mongoose.Types.ObjectId(actorId);
    const before = settings.toObject();

    if (data.documentTitles) {
      const t = data.documentTitles;
      if (t.alteredOrderTitle !== undefined) settings.documentTitles.alteredOrderTitle = t.alteredOrderTitle;
      if (t.commissionInvoiceTitle !== undefined) settings.documentTitles.commissionInvoiceTitle = t.commissionInvoiceTitle;
      if (t.documentFooterNote !== undefined) settings.documentTitles.documentFooterNote = t.documentFooterNote;
    }

    if (data.commissionTax) {
      const c = data.commissionTax;
      if (c.gstApplicable !== undefined) settings.commissionTax.gstApplicable = c.gstApplicable;
      if (c.gstRatePercent !== undefined) settings.commissionTax.gstRatePercent = c.gstRatePercent;
      if (c.sacCode !== undefined) settings.commissionTax.sacCode = c.sacCode;
      if (c.invoiceNumberPrefix !== undefined) settings.commissionTax.invoiceNumberPrefix = c.invoiceNumberPrefix;

      // Refuse an internally inconsistent tax configuration at write time rather
      // than discovering it when someone tries to raise an invoice.
      if (settings.commissionTax.gstApplicable) {
        const rate = settings.commissionTax.gstRatePercent;
        if (rate === undefined || rate === null || !Number.isFinite(rate) || rate <= 0) {
          throw new AppError('OPS_055', 422, 'A GST rate greater than zero is required when GST is applicable.');
        }
        if (!settings.commissionTax.sacCode || !settings.commissionTax.sacCode.trim()) {
          throw new AppError('OPS_055', 422, 'A SAC code is required when GST is applicable.');
        }
      }
    }

    if (data.companyIdentity) {
      const ci = data.companyIdentity;
      if (ci.legalName !== undefined) settings.companyIdentity.legalName = ci.legalName;
      if (ci.gstin !== undefined) settings.companyIdentity.gstin = ci.gstin;
      if (ci.addressLines !== undefined) settings.companyIdentity.addressLines = ci.addressLines;
      if (ci.contactEmail !== undefined) settings.companyIdentity.contactEmail = ci.contactEmail;
      if (ci.contactPhone !== undefined) settings.companyIdentity.contactPhone = ci.contactPhone;
    }

    if (data.alteredOrderEmailSubject !== undefined) {
      settings.alteredOrderEmailSubject = data.alteredOrderEmailSubject;
    }
    if (data.alteredOrderEmailBody !== undefined) {
      settings.alteredOrderEmailBody = data.alteredOrderEmailBody;
    }

    settings.updatedBy = actorOid;
    await settings.save();

    await AuditLog.create({
      performedBy: actorOid,
      action: 'ops.settings.update',
      targetType: 'OpsSettings',
      targetId: String(settings._id),
      changes: { before, after: settings.toObject() },
    });

    return settings;
  }

  /**
   * Gate for raising a commission invoice. Called by CommissionService so an
   * invoice can never be produced with a guessed tax treatment.
   */
  static async assertCommissionTaxReady(): Promise<{
    gstApplicable: boolean;
    gstRatePercent: number;
    sacCode?: string;
    invoiceNumberPrefix: string;
  }> {
    const settings = await this.get();
    const tax = settings.commissionTax;

    if (tax.gstApplicable) {
      if (!tax.gstRatePercent || !Number.isFinite(tax.gstRatePercent) || tax.gstRatePercent <= 0) {
        throw new AppError(
          'OPS_055',
          422,
          'Commission GST is marked applicable but no GST rate is configured. Set it in Work Desk → Ops Settings.',
        );
      }
      if (!tax.sacCode || !tax.sacCode.trim()) {
        throw new AppError(
          'OPS_055',
          422,
          'Commission GST is marked applicable but no SAC code is configured. Set it in Work Desk → Ops Settings.',
        );
      }
    }

    return {
      gstApplicable: tax.gstApplicable,
      gstRatePercent: tax.gstApplicable ? Number(tax.gstRatePercent) : 0,
      sacCode: tax.sacCode,
      invoiceNumberPrefix: tax.invoiceNumberPrefix,
    };
  }

  /** Fills {{token}} placeholders in the email subject/body templates. */
  static renderTemplate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => vars[key] ?? '');
  }
}
