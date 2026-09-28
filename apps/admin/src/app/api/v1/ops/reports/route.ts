/**
 * Work Desk reports (Phase 30.09).
 * Every report is scope-filtered, so a report can never become a way around the
 * row-level visibility rules.
 */
import { OpsReportService } from '@services/ops/OpsReportService';
import { OpsReportQuerySchema } from '@validators/ops/chain';
import { opsQuery } from '@lib/utils/ops-route';

export const dynamic = 'force-dynamic';

export const GET = opsQuery('workdesk', OpsReportQuerySchema, async ({ input, actor }) => {
  const range = { fromDate: input.fromDate, toDate: input.toDate };

  switch (input.report) {
    case 'pipeline':
      return { data: { report: 'pipeline', ...(await OpsReportService.pipeline(actor, range)) } };
    case 'commission':
      return { data: { report: 'commission', ...(await OpsReportService.commission(actor, range)) } };
    case 'manufacturer':
      return { data: { report: 'manufacturer', rows: await OpsReportService.byManufacturer(actor, range) } };
    case 'canteen':
      return { data: { report: 'canteen', rows: await OpsReportService.byCanteen(actor, range) } };
    case 'shortSupply':
      return { data: { report: 'shortSupply', ...(await OpsReportService.shortSupply(actor, range)) } };
    case 'ageing':
    default:
      return { data: { report: 'ageing', ...(await OpsReportService.ageing(actor)) } };
  }
});
