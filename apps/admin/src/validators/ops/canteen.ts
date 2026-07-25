import { z } from 'zod';
import { GstinSchema, OpsListQuerySchema, MongoIdSchema } from './shared';

export const CreateCanteenSchema = z.object({
  code:            z.string().min(1).max(20).toUpperCase(),
  name:            z.string().min(1).max(200),
  type:            z.enum(['main', 'subsidiary']),
  parentCanteenId: MongoIdSchema.optional(),
  gstin:           GstinSchema,
  contactPerson:   z.string().max(100).optional(),
  phone:           z.string().max(20).optional(),
  email:           z.string().email().max(255).optional().or(z.literal('')).transform((v) => v === '' ? undefined : v),
}).refine(
  (d) => !(d.type === 'subsidiary' && !d.parentCanteenId),
  { message: 'parentCanteenId is required for subsidiary canteens', path: ['parentCanteenId'] },
).refine(
  (d) => !(d.type === 'main' && d.parentCanteenId),
  { message: 'main canteens must not have a parent', path: ['parentCanteenId'] },
);

export const UpdateCanteenSchema = z.object({
  name:          z.string().min(1).max(200).optional(),
  gstin:         GstinSchema,
  contactPerson: z.string().max(100).optional(),
  phone:         z.string().max(20).optional(),
  email:         z.string().email().max(255).optional().or(z.literal('')).transform((v) => v === '' ? undefined : v),
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
