import { z } from 'zod';
import { OpsListQuerySchema, MongoIdSchema } from './shared';

export const CreateCommissionRuleSchema = z.object({
  scope:          z.enum(['manufacturer', 'product', 'canteen']),
  manufacturerId: MongoIdSchema.optional(),
  productId:      MongoIdSchema.optional(),
  canteenId:      MongoIdSchema.optional(),
  type:           z.enum(['percentage', 'perUnit', 'flat']),
  value:          z.number().min(0),
  effectiveFrom:  z.string().datetime({ offset: false }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  effectiveTo:    z.string().datetime({ offset: false }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  gstApplicable:  z.boolean().optional(),
  sacCode:        z.string().max(8).optional(),
  notes:          z.string().max(500).optional(),
}).refine(
  (d) => !(d.type === 'percentage' && d.value > 100),
  { message: 'Percentage value must be between 0 and 100', path: ['value'] },
).refine(
  (d) => {
    if (d.scope === 'manufacturer') return !!d.manufacturerId;
    if (d.scope === 'product') return !!d.productId;
    if (d.scope === 'canteen') return !!d.canteenId;
    return false;
  },
  { message: 'The ID field matching the selected scope is required' },
);

export const UpdateCommissionRuleSchema = z.object({
  value:         z.number().min(0).optional(),
  effectiveTo:   z.string().datetime({ offset: false }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  gstApplicable: z.boolean().optional(),
  sacCode:       z.string().max(8).optional(),
  notes:         z.string().max(500).optional(),
}).refine((d) => Object.values(d).some((v) => v !== undefined), {
  message: 'At least one field must be provided',
});

export const CommissionRuleStatusSchema = z.object({ isActive: z.boolean() });

export const ListCommissionRulesSchema = OpsListQuerySchema.extend({
  scope:          z.enum(['manufacturer', 'product', 'canteen']).optional(),
  manufacturerId: MongoIdSchema.optional(),
});
