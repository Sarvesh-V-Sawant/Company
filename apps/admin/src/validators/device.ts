import { z } from 'zod';

export const SubmitDeviceRequestSchema = z.object({
  email:            z.string().email().toLowerCase(),
  password:         z.string().min(1),
  deviceFingerprint: z.string().min(64).max(64),
  deviceName:       z.string().min(1).max(100),
  manufacturer:     z.string().min(1).max(100),
  deviceModel:      z.string().min(1).max(100),
  androidVersion:   z.string().min(1).max(20),
  appVersion:       z.string().min(1).max(20),
  buildNumber:      z.string().min(1).max(20),
  timezone:         z.string().min(1).max(50),
  language:         z.string().min(1).max(20),
  screenResolution: z.string().min(1).max(30),
  batteryLevel:     z.number().int().min(0).max(100).optional(),
  platform:         z.enum(['android', 'ios']),
});

export const GetDeviceRequestStatusSchema = z.object({
  email:             z.string().email(),
  deviceFingerprint: z.string().min(1),
});

export const ListDeviceRequestsSchema = z.object({
  status:  z.enum(['pending', 'approved', 'rejected']).optional(),
  page:    z.coerce.number().int().min(1).default(1),
  limit:   z.coerce.number().int().min(1).max(100).default(20),
  search:  z.string().optional(),
  userId:  z.string().optional(),
});

export const ApproveDeviceRequestSchema = z.object({
  approvalNote: z.string().max(500).optional(),
});

export const RejectDeviceRequestSchema = z.object({
  rejectionReason: z.string().min(10).max(500),
});

export const ListRegisteredDevicesSchema = z.object({
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});
