import { Routes } from '@angular/router';

import { unsavedChangesGuard } from '../../shared/guards/unsaved-changes.guard';

/** Breadcrumb of the Transaction menu group. */
const TRANSACTION = { label: 'Transaction' };
const ORDERS = { label: 'Purchase Orders', link: '/purchase/orders' };
const ENTRIES = { label: 'Purchase Entries', link: '/purchase/entries' };

const poForm = () => import('./orders/po-form-page').then((m) => m.PoFormPage);
const peForm = () => import('./entries/pe-form-page').then((m) => m.PeFormPage);

/** Purchase (administrators only — the guard sits on the parent route). */
export const PURCHASE_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'orders' },
  {
    path: 'orders',
    title: 'Purchase Orders',
    data: { breadcrumbs: [TRANSACTION, { label: 'Purchase Orders' }] },
    loadComponent: () => import('./orders/po-list-page').then((m) => m.PoListPage),
  },
  {
    path: 'orders/new',
    title: 'New Purchase Order',
    data: { breadcrumbs: [TRANSACTION, ORDERS, { label: 'New' }] },
    canDeactivate: [unsavedChangesGuard],
    loadComponent: poForm,
  },
  {
    path: 'orders/:id',
    title: 'Purchase Order',
    data: { breadcrumbs: [TRANSACTION, ORDERS, { label: 'View' }] },
    loadComponent: () => import('./orders/po-view-page').then((m) => m.PoViewPage),
  },
  {
    path: 'orders/:id/edit',
    title: 'Edit Purchase Order',
    data: { breadcrumbs: [TRANSACTION, ORDERS, { label: 'Edit' }] },
    canDeactivate: [unsavedChangesGuard],
    loadComponent: poForm,
  },
  {
    path: 'entries',
    title: 'Purchase Entries',
    data: { breadcrumbs: [TRANSACTION, { label: 'Purchase Entries' }] },
    loadComponent: () => import('./entries/pe-list-page').then((m) => m.PeListPage),
  },
  {
    path: 'entries/new',
    title: 'New Purchase Entry',
    data: { breadcrumbs: [TRANSACTION, ENTRIES, { label: 'New' }] },
    canDeactivate: [unsavedChangesGuard],
    loadComponent: peForm,
  },
  {
    path: 'entries/:id',
    title: 'Purchase Entry',
    data: { breadcrumbs: [TRANSACTION, ENTRIES, { label: 'View' }] },
    loadComponent: () => import('./entries/pe-view-page').then((m) => m.PeViewPage),
  },
  {
    path: 'entries/:id/edit',
    title: 'Edit Purchase Entry',
    data: { breadcrumbs: [TRANSACTION, ENTRIES, { label: 'Edit' }] },
    canDeactivate: [unsavedChangesGuard],
    loadComponent: peForm,
  },
];
