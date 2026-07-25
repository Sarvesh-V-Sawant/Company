import { z } from 'zod';
import { GstinSchema, OpsListQuerySchema, MongoIdSchema } from './shared';

const PINCODE_REGEX = /^\d{6}$/;

export const CreateAddressSchema = z.object({
  ownerType:   z.enum(['canteen', 'manufacturer', 'company']),
  ownerId:     MongoIdSchema,
  label:       z.string().min(1).max(100),
  addressType: z.enum(['shipTo', 'billTo', 'both']),
  line1:       z.string().min(1).max(200),
  line2:       z.string().max(200).optional(),
  city:        z.string().min(1).max(100),
  state:       z.string().min(1).max(100),
  stateCode:   z.string().min(2).max(2).toUpperCase(),
  pincode:     z.string().regex(PINCODE_REGEX, 'Pincode must be 6 digits'),
  gstin:       GstinSchema,
  isDefault:   z.boolean().default(false),
});

export const UpdateAddressSchema = z.object({
  label:       z.string().min(1).max(100).optional(),
  addressType: z.enum(['shipTo', 'billTo', 'both']).optional(),
  line1:       z.string().min(1).max(200).optional(),
  line2:       z.string().max(200).optional(),
  city:        z.string().min(1).max(100).optional(),
  state:       z.string().min(1).max(100).optional(),
  stateCode:   z.string().min(2).max(2).toUpperCase().optional(),
  pincode:     z.string().regex(PINCODE_REGEX, 'Pincode must be 6 digits').optional(),
  gstin:       GstinSchema,
}).refine((d) => Object.values(d).some((v) => v !== undefined), {
  message: 'At least one field must be provided',
});

export const AddressStatusSchema = z.object({ isActive: z.boolean() });

export const ListAddressesSchema = OpsListQuerySchema.extend({
  ownerType: z.enum(['canteen', 'manufacturer', 'company']).optional(),
  ownerId:   MongoIdSchema.optional(),
});
