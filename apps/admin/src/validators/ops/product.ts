import { z } from 'zod';
import { OpsListQuerySchema, MongoIdSchema, requiredText, optionalText, HSN_REGEX } from './shared';

const HsnSchema = z.string().trim().refine((v) => v === '' || HSN_REGEX.test(v), 'HSN code must be 4–8 digits').optional();
const PackSizeSchema = z.number().finite().positive().max(1_000_000).optional();
const UomSchema = z.string().trim().min(1).max(20).toUpperCase();

export const CreateProductSchema = z.object({
  sku:            z.string().trim().min(1).max(50).toUpperCase().refine((v) => !/\s{2,}/.test(v) && !/[\u0000-\u001f]/.test(v), 'SKU contains invalid whitespace'),
  name:           requiredText(200),
  description:    optionalText(1000),
  manufacturerId: MongoIdSchema,
  uom:            UomSchema,
  packSize:       PackSizeSchema,
  hsnCode:        HsnSchema,
  gstRatePercent: z.number().finite().min(0).max(100).optional(),
});

export const UpdateProductSchema = z.object({
  name:           requiredText(200).optional(),
  description:    optionalText(1000),
  uom:            UomSchema.optional(),
  packSize:       PackSizeSchema,
  hsnCode:        HsnSchema,
  gstRatePercent: z.number().finite().min(0).max(100).optional(),
}).refine((d) => Object.values(d).some((v) => v !== undefined), {
  message: 'At least one field must be provided',
});

export const ProductStatusSchema = z.object({ isActive: z.boolean() });

export const ListProductsSchema = OpsListQuerySchema.extend({
  manufacturerId: MongoIdSchema.optional(),
});
