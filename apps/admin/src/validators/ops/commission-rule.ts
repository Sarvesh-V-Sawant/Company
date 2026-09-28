import { z } from 'zod';
import { OpsListQuerySchema, MongoIdSchema, DateInputSchema, RateSchema, dateRangeOk, optionalText } from './shared';

/** SAC codes are 4–8 digits. '' is allowed so a form can clear the field. */
const SacSchema = z.string().trim().refine((v) => v === '' || /^\d{4,8}$/.test(v), 'SAC code must be 4–8 digits').optional();

export const CreateCommissionRuleSchema = z.object({
  scope:          z.enum(['manufacturer', 'product', 'canteen']),
  manufacturerId: MongoIdSchema.optional(),
  productId:      MongoIdSchema.optional(),
  canteenId:      MongoIdSchema.optional(),
  type:           z.enum(['percentage', 'perUnit', 'flat']),
  value:          RateSchema,
  effectiveFrom:  DateInputSchema,
  effectiveTo:    DateInputSchema.optional(),
  gstApplicable:  z.boolean().optional(),
  sacCode:        SacSchema,
  notes:          optionalText(500),
}).refine(dateRangeOk, { message: 'effectiveTo cannot be before effectiveFrom', path: ['effectiveTo'] }).refine(
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
  value:         RateSchema.optional(),
  effectiveTo:   DateInputSchema.optional(),
  gstApplicable: z.boolean().optional(),
  sacCode:       SacSchema,
  notes:         optionalText(500),
}).refine((d) => Object.values(d).some((v) => v !== undefined), {
  message: 'At least one field must be provided',
});

export const CommissionRuleStatusSchema = z.object({ isActive: z.boolean() });

export const ListCommissionRulesSchema = OpsListQuerySchema.extend({
  scope:          z.enum(['manufacturer', 'product', 'canteen']).optional(),
  manufacturerId: MongoIdSchema.optional(),
});
