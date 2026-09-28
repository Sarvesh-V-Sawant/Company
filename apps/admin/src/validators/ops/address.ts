import { z } from 'zod';
import { GstinSchema, OpsListQuerySchema, MongoIdSchema, requiredText, optionalText, STATE_CODE_REGEX } from './shared';

const StateCodeSchema = z.string().trim().length(2).toUpperCase().regex(STATE_CODE_REGEX, 'State code must be a 2-digit GST code or 2-letter abbreviation');

/** When both a numeric state code and a GSTIN are given, the GSTIN prefix must agree. */
const gstinMatchesState = (d: { stateCode?: string; gstin?: string }): boolean =>
  !d.gstin || !d.stateCode || !/^\d{2}$/.test(d.stateCode) || d.gstin.slice(0, 2) === d.stateCode;

const PINCODE_REGEX = /^\d{6}$/;

export const CreateAddressSchema = z.object({
  ownerType:   z.enum(['canteen', 'manufacturer', 'company']),
  ownerId:     MongoIdSchema.optional(),
  label:       requiredText(100),
  addressType: z.enum(['shipTo', 'billTo', 'both']),
  line1:       requiredText(200),
  line2:       optionalText(200),
  city:        requiredText(100),
  state:       requiredText(100),
  stateCode:   StateCodeSchema,
  pincode:     z.string().trim().regex(PINCODE_REGEX, 'Pincode must be 6 digits'),
  gstin:       GstinSchema,
  isDefault:   z.boolean().default(false),
}).refine(
  (d) => d.ownerType === 'company' || !!d.ownerId,
  { message: 'ownerId is required for canteen and manufacturer addresses', path: ['ownerId'] },
).refine(gstinMatchesState, { message: 'GSTIN state prefix does not match the state code', path: ['gstin'] });

export const UpdateAddressSchema = z.object({
  label:       requiredText(100).optional(),
  addressType: z.enum(['shipTo', 'billTo', 'both']).optional(),
  line1:       requiredText(200).optional(),
  line2:       optionalText(200),
  city:        requiredText(100).optional(),
  state:       requiredText(100).optional(),
  stateCode:   StateCodeSchema.optional(),
  pincode:     z.string().trim().regex(PINCODE_REGEX, 'Pincode must be 6 digits').optional(),
  gstin:       GstinSchema,
}).refine((d) => Object.values(d).some((v) => v !== undefined), {
  message: 'At least one field must be provided',
});

export const AddressStatusSchema = z.object({ isActive: z.boolean() });

export const ListAddressesSchema = OpsListQuerySchema.extend({
  ownerType: z.enum(['canteen', 'manufacturer', 'company']).optional(),
  ownerId:   MongoIdSchema.optional(),
});
