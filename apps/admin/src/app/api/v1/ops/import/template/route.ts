import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, AuthError } from '@mw/requireAuth';
import { assertWorkDeskAccess } from '@mw/requireRole';
import { apiError } from '@lib/utils/api-response';

export const dynamic = 'force-dynamic';

const TEMPLATES: Record<string, { headers: string[]; example: (string | number)[] }> = {
  CANTEEN: {
    headers: ['Code', 'Name', 'Type', 'ParentCanteenCode', 'GSTIN', 'ContactPerson', 'Phone', 'Email'],
    example:  ['CNT001', 'Main Canteen', 'main', '', '22ABCDE1234F1Z5', 'John Doe', '9876543210', 'canteen@example.com'],
  },
  MANUFACTURER: {
    headers: ['Code', 'Name', 'GSTIN', 'PrimaryEmail', 'ContactPerson', 'Phone'],
    example:  ['MFR001', 'ABC Manufacturers', '22ABCDE1234F1Z5', 'contact@mfr.com', 'Jane Doe', '9876543210'],
  },
  PRODUCT: {
    headers: ['SKU', 'Name', 'ManufacturerCode', 'UOM', 'PackSize', 'HSNCode', 'GSTRatePercent'],
    example:  ['PROD001', 'Product Name', 'MFR001', 'PCS', 12, '09011100', 5],
  },
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  let payload;
  try { payload = await getAuthUser(request); }
  catch (err) { if (err instanceof AuthError) return apiError(err.code, 'Unauthorized.', err.httpStatus); throw err; }
  try { assertWorkDeskAccess(payload); }
  catch (err) { if (err instanceof AuthError) return apiError(err.code, 'Forbidden.', err.httpStatus); throw err; }

  const entity = (new URL(request.url).searchParams.get('entity') ?? 'CANTEEN').toUpperCase();
  const template = TEMPLATES[entity];
  if (!template) return apiError('GEN_001', `No template for entity "${entity}".`, 400);

  const ExcelJSLib = (await import('exceljs')).default;
  const wb = new ExcelJSLib.Workbook();
  const ws = wb.addWorksheet('Import');

  ws.addRow(template.headers);
  ws.addRow(template.example);

  ws.getRow(1).font = { bold: true };
  template.headers.forEach((_, i) => { ws.getColumn(i + 1).width = 20; });

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${entity}-import-template.xlsx"`,
    },
  });
}
