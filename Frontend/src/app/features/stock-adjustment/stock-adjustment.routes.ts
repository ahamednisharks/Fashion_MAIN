import { Routes } from '@angular/router';

import { unsavedChangesGuard } from '../../shared/guards/unsaved-changes.guard';

/** Breadcrumb of the Transaction menu group (the URL stays under /masters). */
const TRANSACTION = { label: 'Transaction' };
const ADJUSTMENTS = { label: 'Stock Adjustment', link: '/masters/stock-adjustment' };

/** Stock adjustments (administrators only — the guard sits on the parent route). */
export const STOCK_ADJUSTMENT_ROUTES: Routes = [
  {
    path: '',
    title: 'Stock Adjustment',
    data: { breadcrumbs: [TRANSACTION, { label: 'Stock Adjustment' }] },
    loadComponent: () => import('./adjustment-list-page').then((m) => m.AdjustmentListPage),
  },
  {
    path: 'new',
    title: 'New Stock Adjustment',
    data: { breadcrumbs: [TRANSACTION, ADJUSTMENTS, { label: 'New' }] },
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./adjustment-form-page').then((m) => m.AdjustmentFormPage),
  },
  {
    path: ':id',
    title: 'Stock Adjustment',
    data: { breadcrumbs: [TRANSACTION, ADJUSTMENTS, { label: 'View' }] },
    loadComponent: () => import('./adjustment-view-page').then((m) => m.AdjustmentViewPage),
  },
];
