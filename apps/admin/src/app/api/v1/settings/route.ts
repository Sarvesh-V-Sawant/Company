import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { SettingsService } from '@services/SettingsService';
import { AppError } from '@services/AuthService';
import { getAuthUser, AuthError } from '@mw/requireAuth';
import { assertRole } from '@mw/requireRole';
import { apiError, success } from '@lib/utils/api-response';

export const dynamic = 'force-dynamic';

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

const PatchBodySchema = z.object({
  company: z.object({
    name:     z.string().min(1).optional(),
    address:  z.string().optional(),
    timezone: z.string().min(1).optional(),
    currency: z.string().length(3).optional(),
  }).optional(),
  shift: z.object({
    startTime:          z.string().regex(/^\d{2}:\d{2}$/).optional(),
    endTime:            z.string().regex(/^\d{2}:\d{2}$/).optional(),
    gracePeriodMinutes: z.number().int().min(0).max(120).optional(),
  }).optional(),
  geofence: z.object({
    enabled:      z.boolean(),
    lat:          z.number().min(-90).max(90),
    lng:          z.number().min(-180).max(180),
    radiusMeters: z.number().min(50).max(5000),
  }).optional(),
  workingDays: z.array(z.enum(WEEKDAYS)).min(1).optional(),
});

function toShape(s: Awaited<ReturnType<typeof SettingsService.getSettings>>) {
  return {
    company: {
      name:     s.companyName,
      timezone: s.timezone,
      currency: s.currency,
    },
    workingDays: s.workingDays,
    shift: {
      startTime:          s.workStartTime,
      endTime:            s.workEndTime,
      gracePeriodMinutes: s.lateArrivalGraceMinutes,
    },
    geofence: {
      lat:          s.geoFence.latitude,
      lng:          s.geoFence.longitude,
      radiusMeters: s.geoFence.radiusMeters,
      enabled:      s.geoFence.isEnabled,
    },
  };
}

async function getAdmin(request: NextRequest) {
  const payload = await getAuthUser(request);
  assertRole(payload, 'admin');
  return payload;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try { await getAdmin(request); }
  catch (err) {
    if (err instanceof AuthError) return apiError(err.code, 'Unauthorized.', err.httpStatus);
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }

  try {
    const s = await SettingsService.getSettings();
    return success(toShape(s), 200);
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try { await getAdmin(request); }
  catch (err) {
    if (err instanceof AuthError) return apiError(err.code, 'Unauthorized.', err.httpStatus);
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError('GEN_001', 'Invalid JSON body.', 400); }

  let parsed;
  try { parsed = PatchBodySchema.parse(body); }
  catch (err) {
    if (err instanceof ZodError) return apiError('GEN_001', 'Validation failed.', 400);
    throw err;
  }

  try {
    const ops: Promise<unknown>[] = [];

    // company.name/timezone/currency + shift.gracePeriodMinutes both go to updateCompany
    const companyUpdate: Record<string, unknown> = {};
    if (parsed.company?.name)     companyUpdate.companyName            = parsed.company.name;
    if (parsed.company?.timezone) companyUpdate.timezone               = parsed.company.timezone;
    if (parsed.company?.currency) companyUpdate.currency               = parsed.company.currency;
    if (parsed.shift?.gracePeriodMinutes !== undefined)
      companyUpdate.lateArrivalGraceMinutes = parsed.shift.gracePeriodMinutes;

    if (Object.keys(companyUpdate).length > 0)
      ops.push(SettingsService.updateCompany(companyUpdate as Parameters<typeof SettingsService.updateCompany>[0]));

    // shift.startTime/endTime go to updateShift
    const shiftUpdate: Record<string, unknown> = {};
    if (parsed.shift?.startTime) shiftUpdate.workStartTime = parsed.shift.startTime;
    if (parsed.shift?.endTime)   shiftUpdate.workEndTime   = parsed.shift.endTime;

    if (Object.keys(shiftUpdate).length > 0)
      ops.push(SettingsService.updateShift(shiftUpdate as Parameters<typeof SettingsService.updateShift>[0]));

    if (parsed.geofence)
      ops.push(SettingsService.updateGeofence({
        latitude:     parsed.geofence.lat,
        longitude:    parsed.geofence.lng,
        radiusMeters: parsed.geofence.radiusMeters,
        isEnabled:    parsed.geofence.enabled,
      }));

    if (parsed.workingDays)
      ops.push(SettingsService.updateWorkingDays({ workingDays: parsed.workingDays }));

    if (ops.length === 0) return apiError('GEN_001', 'No updates provided.', 400);

    await Promise.all(ops);

    const s = await SettingsService.getSettings();
    return success(toShape(s), 200);
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }
}
