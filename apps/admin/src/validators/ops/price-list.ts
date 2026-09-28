import { z } from 'zod';
import { OpsListQuerySchema, MongoIdSchema, DateInputSchema, RateSchema, dateRangeOk } from './shared';

export const PriceListItemSchema = z.object({
  productId: MongoIdSchema,
  rate:      RateSchema,
});

const noDuplicateProducts = (d: { items?: { productId: string }[] }): boolean => {
  if (!d.items) return true;
  const ids = d.items.map((i) => i.productId);
  return new Set(ids).size === ids.length;
};

export const CreatePriceListSchema = z.object({
  manufacturerId: MongoIdSchema,
  canteenId:      MongoIdSchema.optional(),
  effectiveFrom:  DateInputSchema,
  effectiveTo:    DateInputSchema.optional(),
  items:          z.array(PriceListItemSchema).min(1).max(2000),
}).refine(
  noDuplicateProducts,
  { message: 'Duplicate products in the same price list are not allowed', path: ['items'] },
).refine(
  dateRangeOk,
  { message: 'effectiveTo cannot be before effectiveFrom', path: ['effectiveTo'] },
);

export const UpdatePriceListSchema = z.object({
  effectiveFrom: DateInputSchema.optional(),
  effectiveTo:   DateInputSchema.optional(),
  items:         z.array(PriceListItemSchema).min(1).max(2000).optional(),
}).refine((d) => Object.values(d).some((v) => v !== undefined), {
  message: 'At least one field must be provided',
}).refine(
  noDuplicateProducts,
  { message: 'Duplicate products in the same price list are not allowed', path: ['items'] },
).refine(
  dateRangeOk,
  { message: 'effectiveTo cannot be before effectiveFrom', path: ['effectiveTo'] },
);

export const PriceListStatusSchema = z.object({ isActive: z.boolean() });

export const ListPriceListsSchema = OpsListQuerySchema.extend({
  manufacturerId: MongoIdSchema.optional(),
  canteenId:      MongoIdSchema.optional(),
});
