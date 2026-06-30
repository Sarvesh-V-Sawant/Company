import { NextRequest, NextResponse } from 'next/server';
import { PayrollService } from '@services/PayrollService';
import { AppError } from '@services/AuthService';
import { getAuthUser, AuthError } from '@mw/requireAuth';
import { assertRole } from '@mw/requireRole';
import { apiError } from '@lib/utils/api-response';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; yearMonth: string }> },
): Promise<NextResponse> {
  let payload;
  try { payload = await getAuthUser(request); }
  catch (err) {
    if (err instanceof AuthError) return apiError(err.code, 'Unauthorized.', err.httpStatus);
    throw err;
  }

  try { assertRole(payload, 'admin'); }
  catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }

  const { id, yearMonth } = await context.params;

  if (!/^[0-9a-f]{24}$/i.test(id)) return apiError('GEN_001', 'Invalid employee id.', 400);
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) return apiError('GEN_001', 'Invalid yearMonth format.', 400);

  const format = request.nextUrl.searchParams.get('format') ?? 'pdf';
  if (format !== 'pdf' && format !== 'xlsx') return apiError('GEN_001', 'format must be pdf or xlsx.', 400);

  // Validate payroll exists (BR-PAY-15)
  try {
    await PayrollService.getByEmployeeMonth({ employeeId: id, yearMonth });
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }

  // PDF/Excel generation requires pdfkit / exceljs — not installed in v1 (BR-PAY-16 — deferred)
  return apiError('PAY_005', 'Payroll export (PDF/XLSX) requires additional library installation. Feature deferred to Phase 8.', 501);
}
