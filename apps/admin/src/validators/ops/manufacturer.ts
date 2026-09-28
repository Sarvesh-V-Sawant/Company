import { z } from 'zod';
import { MongoIdSchema, GstinSchema, OpsListQuerySchema, CODE_REGEX, MASTER_CODE_MESSAGE, requiredText, optionalText, PhoneSchema } from './shared';

const URL_SCHEMA = z.string().url('Must be a valid URL').max(500).optional().or(z.literal('')).transform((v) => v === '' ? undefined : v);
const EMAIL_SCHEMA = z.string().trim().toLowerCase().email().max(255);

export const CreateManufacturerSchema = z.object({
  code:             z.string().trim().min(1).max(20).toUpperCase().regex(CODE_REGEX, MASTER_CODE_MESSAGE),
  name:             requiredText(200),
  gstin:            GstinSchema,
  portalName:       optionalText(200),
  portalUrl:        URL_SCHEMA,
  primaryEmail:     EMAIL_SCHEMA,
  additionalEmails: z.array(EMAIL_SCHEMA).max(10).default([]),
  contactPerson:    optionalText(100),
  phone:            PhoneSchema,
});

export const UpdateManufacturerSchema = z.object({
  /** '' clears it. Must target this manufacturer — checked in the service. */
  defaultCommissionRuleId: MongoIdSchema.or(z.literal('')).optional(),
  name:             requiredText(200).optional(),
  gstin:            GstinSchema,
  portalName:       optionalText(200),
  portalUrl:        URL_SCHEMA,
  primaryEmail:     EMAIL_SCHEMA.optional(),
  additionalEmails: z.array(EMAIL_SCHEMA).max(10).optional(),
  contactPerson:    optionalText(100),
  phone:            PhoneSchema,
}).refine((d) => Object.values(d).some((v) => v !== undefined), {
  message: 'At least one field must be provided',
});

export const ManufacturerStatusSchema = z.object({ isActive: z.boolean() });

export const ListManufacturersSchema = OpsListQuerySchema;
