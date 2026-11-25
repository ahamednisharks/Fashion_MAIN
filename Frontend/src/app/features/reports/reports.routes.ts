import { Routes } from '@angular/router';

const REPORTS = { label: 'Reports' };

const comingSoon = () => import('../placeholders/coming-soon-page').then((m) => m.ComingSoonPage);

/** Reports (administrators only — the guard sits on the parent route). */
export const REPORTS_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'sales' },
  {
    path: 'sales',
    title: 'Sales Report',
    data: { breadcrumbs: [REPORTS, { label: 'Sales Report' }] },
    loadComponent: () => import('./sales-report/sales-report-page').then((m) => m.SalesReportPage),
  },
  {
    path: 'stock',
    title: 'Stock Report',
    data: { breadcrumbs: [REPORTS, { label: 'Stock Report' }] },
    loadComponent: () => import('./stock-report/stock-report-page').then((m) => m.StockReportPage),
  },
  // Planned reports — placeholders only.
  {
    path: 'customer-sales',
    title: 'Customer-wise Sales',
    data: {
      breadcrumbs: [REPORTS, { label: 'Customer-wise Sales' }],
      module: 'Customer-wise Sales',
      icon: 'people',
      summary: 'Sales grouped by customer for any period, with walk-in customers as one row.',
    },
    loadComponent: comingSoon,
  },
  {
    path: 'purchase',
    title: 'Purchase Report',
    data: {
      breadcrumbs: [REPORTS, { label: 'Purchase Report' }],
      module: 'Purchase Report',
      icon: 'cart3',
      summary: 'Purchases by period and supplier — available once the Purchase module is built.',
    },
    loadComponent: comingSoon,
  },
];
