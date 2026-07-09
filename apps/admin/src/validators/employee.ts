import { z } from 'zod';

const E164_REGEX = /^\+[1-9]\d{1,14}$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const ListEmployeesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(100).optional(),
  department: z.string().max(100).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  sortBy: z
    .enum(['firstName', 'lastName', 'employeeId', 'createdAt', 'dateOfJoining'])
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const CreateEmployeeSchema = z.object({
  employeeId: z.string().min(1).max(20),
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  email: z.string().email().max(255),
  role: z.enum(['admin', 'employee']).default('employee'),
  phone: z.string().regex(E164_REGEX, 'Must be E.164 format (+countrycode...)').optional(),
  department: z.string().max(100).optional(),
  designation: z.string().max(100).optional(),
  monthlySalary: z.number().min(0),
  dateOfJoining: z
    .string()
    .regex(DATE_REGEX, 'Must be YYYY-MM-DD')
    .refine((d) => new Date(d) <= new Date(), { message: 'dateOfJoining cannot be in the future' }),
});

export const UpdateEmployeeSchema = z
  .object({
    firstName: z.string().min(1).max(50).optional(),
    lastName: z.string().min(1).max(50).optional(),
    phone: z.string().regex(E164_REGEX, 'Must be E.164 format').nullable().optional(),
    department: z.string().max(100).nullable().optional(),
    designation: z.string().max(100).nullable().optional(),
    monthlySalary: z.number().min(0).optional(),
    dateOfLeaving: z
      .string()
      .regex(DATE_REGEX, 'Must be YYYY-MM-DD')
      .nullable()
      .optional(),
    allowOutsideGeofence: z.boolean().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: 'At least one field must be provided',
  });

export const DeactivateEmployeeSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const RegisterDeviceSchema = z.object({
  deviceFingerprint: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, 'Must be a 64-character hex string'),
  deviceName: z.string().max(100).optional(),
  platform: z.enum(['ios', 'android']).default('android'),
});
