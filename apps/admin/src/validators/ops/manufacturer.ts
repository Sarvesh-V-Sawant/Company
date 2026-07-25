import { z } from 'zod';
import { GstinSchema, OpsListQuerySchema } from './shared';

const URL_SCHEMA = z.string().url('Must be a valid URL').max(500).optional().or(z.literal('')).transform((v) => v === '' ? undefined : v);
const EMAIL_SCHEMA = z.string().email().max(255);

export const CreateManufacturerSchema = z.object({
  code:             z.string().min(1).max(20).toUpperCase(),
  name:             z.string().min(1).max(200),
  gstin:            GstinSchema,
  portalName:       z.string().max(200).optional(),
  portalUrl:        URL_SCHEMA,
  primaryEmail:     EMAIL_SCHEMA,
  additionalEmails: z.array(EMAIL_SCHEMA).max(10).default([]),
  contactPerson:    z.string().max(100).optional(),
  phone:            z.string().max(20).optional(),
});

export const UpdateManufacturerSchema = z.object({
  name:             z.string().min(1).max(200).optional(),
  gstin:            GstinSchema,
  portalName:       z.string().max(200).optional(),
  portalUrl:        URL_SCHEMA,
  primaryEmail:     EMAIL_SCHEMA.optional(),
  additionalEmails: z.array(EMAIL_SCHEMA).max(10).optional(),
  contactPerson:    z.string().max(100).optional(),
  phone:            z.string().max(20).optional(),
}).refine((d) => Object.values(d).some((v) => v !== undefined), {
  message: 'At least one field must be provided',
});

export const ManufacturerStatusSchema = z.object({ isActive: z.boolean() });

export const ListManufacturersSchema = OpsListQuerySchema;
