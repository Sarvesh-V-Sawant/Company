import { z } from 'zod';
import { OpsListQuerySchema, MongoIdSchema } from './shared';

export const PriceListItemSchema = z.object({
  productId: MongoIdSchema,
  rate:      z.number().min(0),
});

export const CreatePriceListSchema = z.object({
  manufacturerId: MongoIdSchema,
  canteenId:      MongoIdSchema.optional(),
  effectiveFrom:  z.string().datetime({ offset: false }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  effectiveTo:    z.string().datetime({ offset: false }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  items:          z.array(PriceListItemSchema).min(1),
}).refine(
  (d) => {
    const ids = d.items.map((i) => i.productId);
    return new Set(ids).size === ids.length;
  },
  { message: 'Duplicate products in the same price list are not allowed', path: ['items'] },
);

export const UpdatePriceListSchema = z.object({
  effectiveFrom: z.string().datetime({ offset: false }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  effectiveTo:   z.string().datetime({ offset: false }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  items:         z.array(PriceListItemSchema).min(1).optional(),
}).refine((d) => Object.values(d).some((v) => v !== undefined), {
  message: 'At least one field must be provided',
}).refine(
  (d) => {
    if (!d.items) return true;
    const ids = d.items.map((i) => i.productId);
    return new Set(ids).size === ids.length;
  },
  { message: 'Duplicate products in the same price list are not allowed', path: ['items'] },
);

export const PriceListStatusSchema = z.object({ isActive: z.boolean() });

export const ListPriceListsSchema = OpsListQuerySchema.extend({
  manufacturerId: MongoIdSchema.optional(),
  canteenId:      MongoIdSchema.optional(),
});
