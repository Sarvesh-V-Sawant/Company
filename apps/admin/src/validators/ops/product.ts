import { z } from 'zod';
import { OpsListQuerySchema, MongoIdSchema } from './shared';

export const CreateProductSchema = z.object({
  sku:            z.string().min(1).max(50).toUpperCase(),
  name:           z.string().min(1).max(200),
  description:    z.string().max(1000).optional(),
  manufacturerId: MongoIdSchema,
  uom:            z.string().min(1).max(20),
  packSize:       z.number().positive().optional(),
  hsnCode:        z.string().max(8).optional(),
  gstRatePercent: z.number().min(0).max(100).optional(),
});

export const UpdateProductSchema = z.object({
  name:           z.string().min(1).max(200).optional(),
  description:    z.string().max(1000).optional(),
  uom:            z.string().min(1).max(20).optional(),
  packSize:       z.number().positive().optional(),
  hsnCode:        z.string().max(8).optional(),
  gstRatePercent: z.number().min(0).max(100).optional(),
}).refine((d) => Object.values(d).some((v) => v !== undefined), {
  message: 'At least one field must be provided',
});

export const ProductStatusSchema = z.object({ isActive: z.boolean() });

export const ListProductsSchema = OpsListQuerySchema.extend({
  manufacturerId: MongoIdSchema.optional(),
});
