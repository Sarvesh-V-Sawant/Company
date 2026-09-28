import { z } from 'zod';
import { GstinSchema, OpsListQuerySchema, MongoIdSchema, CODE_REGEX, MASTER_CODE_MESSAGE, requiredText, optionalText, PhoneSchema } from './shared';

export const CreateCanteenSchema = z.object({
  code:            z.string().trim().min(1).max(20).toUpperCase().regex(CODE_REGEX, MASTER_CODE_MESSAGE),
  name:            requiredText(200),
  type:            z.enum(['main', 'subsidiary']),
  parentCanteenId: MongoIdSchema.optional(),
  gstin:           GstinSchema,
  contactPerson:   optionalText(100),
  phone:           PhoneSchema,
  email:           z.string().trim().toLowerCase().email().max(255).optional().or(z.literal('')).transform((v) => v === '' ? undefined : v),
}).refine(
  (d) => !(d.type === 'subsidiary' && !d.parentCanteenId),
  { message: 'parentCanteenId is required for subsidiary canteens', path: ['parentCanteenId'] },
).refine(
  (d) => !(d.type === 'main' && d.parentCanteenId),
  { message: 'main canteens must not have a parent', path: ['parentCanteenId'] },
);

export const UpdateCanteenSchema = z.object({
  name:          requiredText(200).optional(),
  gstin:         GstinSchema,
  contactPerson: optionalText(100),
  phone:         PhoneSchema,
  email:         z.string().trim().toLowerCase().email().max(255).optional().or(z.literal('')).transform((v) => v === '' ? undefined : v),
}).refine((d) => Object.values(d).some((v) => v !== undefined), {
  message: 'At least one field must be provided',
});

export const CanteenStatusSchema = z.object({
  isActive: z.boolean(),
});

export const ListCanteensSchema = OpsListQuerySchema.extend({
  type:             z.enum(['main', 'subsidiary']).optional(),
  parentCanteenId:  MongoIdSchema.optional(),
});
