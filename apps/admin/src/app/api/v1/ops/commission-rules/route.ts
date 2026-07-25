import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { ListCommissionRulesSchema, CreateCommissionRuleSchema } from '@validators/ops/commission-rule';
import { CommissionRuleService } from '@services/ops/CommissionRuleService';
import { AppError } from '@services/AuthService';
import { getAuthUser, AuthError } from '@mw/requireAuth';
import { assertWorkDeskAccess, assertRole } from '@mw/requireRole';
import { success, apiError } from '@lib/utils/api-response';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  let payload;
  try { payload = await getAuthUser(request); }
  catch (err) { if (err instanceof AuthError) return apiError(err.code, 'Unauthorized.', err.httpStatus); throw err; }
  try { assertWorkDeskAccess(payload); }
  catch (err) { if (err instanceof AuthError) return apiError(err.code, 'Forbidden.', err.httpStatus); throw err; }

  const { searchParams } = new URL(request.url);
  let query;
  try { query = ListCommissionRulesSchema.parse(Object.fromEntries(searchParams)); }
  catch (err) { if (err instanceof ZodError) return apiError('GEN_001', 'Validation failed.', 400); throw err; }

  try {
    const result = await CommissionRuleService.list(query);
    return NextResponse.json({ success: true, data: result.data, pagination: result.pagination });
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let payload;
  try { payload = await getAuthUser(request); }
  catch (err) { if (err instanceof AuthError) return apiError(err.code, 'Unauthorized.', err.httpStatus); throw err; }
  try { assertRole(payload, 'super_admin', 'admin', 'manager'); }
  catch (err) { if (err instanceof AuthError) return apiError(err.code, 'Forbidden.', err.httpStatus); throw err; }

  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError('GEN_001', 'Invalid JSON body.', 400); }

  let parsed;
  try { parsed = CreateCommissionRuleSchema.parse(body); }
  catch (err) { if (err instanceof ZodError) return apiError('GEN_001', 'Validation failed.', 400); throw err; }

  try {
    const result = await CommissionRuleService.create(parsed, payload.userId);
    return success(result, 201);
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }
}
