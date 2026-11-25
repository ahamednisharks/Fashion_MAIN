import { Routes } from '@angular/router';

import {
  adminGuard,
  authGuard,
  guestGuard,
  homeRedirectGuard,
  signedInGuard,
} from './core/auth/auth.guards';
import { Shell } from './core/layout/shell/shell';
import { unsavedChangesGuard } from './shared/guards/unsaved-changes.guard';

/**
 * Sign-in pages render on their own; every other page renders inside the application shell,
 * requires a signed-in user and is lazy loaded.
 * Route `title` feeds the header/document title; `data.breadcrumbs` feeds the header breadcrumb.
 */
export const routes: Routes = [
  {
    path: 'login',
    title: 'Sign in',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login-page').then((m) => m.LoginPage),
  },
  {
    path: 'account/password',
    title: 'Change password',
    canActivate: [signedInGuard],
    loadComponent: () =>
      import('./features/auth/change-password-page').then((m) => m.ChangePasswordPage),
  },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      // Home page depends on the role: administrators → dashboard, staff → billing.
      { path: '', pathMatch: 'full', canActivate: [homeRedirectGuard], children: [] },
      {
        path: 'dashboard',
        title: 'Dashboard',
        data: { breadcrumbs: [{ label: 'Dashboard' }] },
        loadComponent: () =>
          import('./features/dashboard/dashboard-page').then((m) => m.DashboardPage),
      },
      {
        path: 'masters',
        loadChildren: () =>
          import('./features/masters/masters.routes').then((m) => m.MASTERS_ROUTES),
      },
      {
        path: 'billing',
        title: 'Billing',
        data: { breadcrumbs: [{ label: 'Billing' }] },
        // Leaving with items on the bill asks for confirmation.
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./features/billing/billing-page').then((m) => m.BillingPage),
      },
      {
        path: 'purchase',
        // Purchase rates show the shop's margins: administrators only.
        canActivate: [adminGuard],
        loadChildren: () =>
          import('./features/purchase/purchase.routes').then((m) => m.PURCHASE_ROUTES),
      },
      {
        path: 'reports',
        // Business figures (turnover, GST) are for administrators only.
        canActivate: [adminGuard],
        loadChildren: () =>
          import('./features/reports/reports.routes').then((m) => m.REPORTS_ROUTES),
      },
      {
        path: 'users',
        title: 'Users',
        canActivate: [adminGuard],
        data: { breadcrumbs: [{ label: 'Users' }] },
        loadComponent: () => import('./features/users/users-page').then((m) => m.UsersPage),
      },
      {
        path: 'settings',
        title: 'Settings',
        data: { breadcrumbs: [{ label: 'Settings' }] },
        loadComponent: () =>
          import('./features/settings/settings-page').then((m) => m.SettingsPage),
      },
      {
        path: '**',
        title: 'Page not found',
        loadComponent: () =>
          import('./features/placeholders/not-found-page').then((m) => m.NotFoundPage),
      },
    ],
  },
];
