import { type ApiModule, defineRoute } from '../../common/http/route.js';
import { ReportsRepository } from './reports.repository.js';
import {
  MAX_STOCK_EXPORT_ROWS,
  type SalesReport,
  type StockReport,
  type StockReportExport,
  salesReportQuerySchema,
  salesReportSchema,
  stockReportExportQuerySchema,
  stockReportExportSchema,
  stockReportQuerySchema,
  stockReportSchema,
} from './reports.schema.js';

const repository = new ReportsRepository();

export const reportsModule: ApiModule = {
  basePath: '/reports',
  tag: 'Reports',
  access: 'admin',
  description:
    'Business reports (administrators only). Dates are the shop-local (IST) document dates; ' +
    'both ends of a period are included and a period can be at most 366 days.',
  routes: [
    defineRoute({
      method: 'get',
      path: '/sales',
      summary: 'Sales summary for a period, day by day',
      description:
        'Totals of completed bills: count, quantity, discount, taxable value, GST, net sales ' +
        'and the payment split (cash is net of change returned). `days` lists only days that ' +
        'had sales.',
      schemas: { query: salesReportQuerySchema },
      success: { status: 200, description: 'The sales report.', schema: salesReportSchema },
      errors: [400],
      handle: async ({ query }): Promise<SalesReport> => ({
        from: query.from,
        to: query.to,
        ...(await repository.salesByDay(query.from, query.to)),
      }),
    }),
    defineRoute({
      method: 'get',
      path: '/stock',
      summary: 'Stock of every item for a period: opening, in, out, closing',
      description:
        'One row per item (variant, or product without variants): the stock at the start of ' +
        '`from`, goods received (purchase entries), sold (bills) and adjusted in the period, ' +
        'and the stock at the end of `to` with its value at the purchase rate. Filter by ' +
        'brand, size, colour, search and stock; `totals` cover every matching item.',
      schemas: { query: stockReportQuerySchema },
      success: {
        status: 200,
        description: 'A page of the stock report.',
        schema: stockReportSchema,
      },
      errors: [400],
      handle: async ({ query }): Promise<StockReport> => ({
        from: query.from,
        to: query.to,
        ...(await repository.stockReport(query)),
      }),
    }),
    defineRoute({
      method: 'get',
      path: '/stock/export',
      summary: 'The whole stock report (for Excel / PDF files)',
      description:
        'Same filters and order as /reports/stock without paging: every matching item, at ' +
        `most ${MAX_STOCK_EXPORT_ROWS} (\`truncated\` says when there were more).`,
      schemas: { query: stockReportExportQuerySchema },
      success: {
        status: 200,
        description: 'Every row of the stock report.',
        schema: stockReportExportSchema,
      },
      errors: [400],
      handle: async ({ query }): Promise<StockReportExport> => ({
        from: query.from,
        to: query.to,
        ...(await repository.stockReportAll(query)),
      }),
    }),
  ],
};
