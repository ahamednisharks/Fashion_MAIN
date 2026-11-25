import { Routes } from '@angular/router';

import { adminGuard } from '../../core/auth/auth.guards';
import { unsavedChangesGuard } from '../../shared/guards/unsaved-changes.guard';

const MASTERS = { label: 'Masters' };
const PRODUCTS = { label: 'Products', link: '/masters/products' };

export const MASTERS_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'products' },
  {
    path: 'categories',
    title: 'Categories',
    data: { breadcrumbs: [MASTERS, { label: 'Categories' }] },
    loadComponent: () => import('./categories/categories-page').then((m) => m.CategoriesPage),
  },
  {
    path: 'brands',
    title: 'Brands',
    data: { breadcrumbs: [MASTERS, { label: 'Brands' }] },
    loadComponent: () => import('./brands/brands-page').then((m) => m.BrandsPage),
  },
  {
    path: 'sizes',
    title: 'Sizes',
    data: { breadcrumbs: [MASTERS, { label: 'Sizes' }] },
    loadComponent: () => import('./sizes/sizes-page').then((m) => m.SizesPage),
  },
  {
    path: 'colors',
    title: 'Colors',
    data: { breadcrumbs: [MASTERS, { label: 'Colors' }] },
    loadComponent: () => import('./colors/colors-page').then((m) => m.ColorsPage),
  },
  {
    path: 'suppliers',
    title: 'Suppliers',
    data: { breadcrumbs: [MASTERS, { label: 'Suppliers' }] },
    loadComponent: () => import('./suppliers/suppliers-page').then((m) => m.SuppliersPage),
  },
  {
    path: 'customers',
    title: 'Customers',
    data: { breadcrumbs: [MASTERS, { label: 'Customers' }] },
    loadComponent: () => import('./customers/customers-page').then((m) => m.CustomersPage),
  },
  {
    path: 'items',
    title: 'Items',
    data: { breadcrumbs: [MASTERS, { label: 'Items' }] },
    loadComponent: () => import('./items/items-page').then((m) => m.ItemsPage),
  },
  {
    path: 'barcodes',
    title: 'Barcode Assign',
    data: { breadcrumbs: [MASTERS, { label: 'Barcode Assign' }] },
    // Leaving with items still waiting for a barcode asks for confirmation.
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('../barcodes/barcode-assign-page').then((m) => m.BarcodeAssignPage),
  },
  {
    path: 'stock-adjustment',
    // Changing stock (and seeing purchase costs) is for administrators only.
    canActivate: [adminGuard],
    loadChildren: () =>
      import('../stock-adjustment/stock-adjustment.routes').then((m) => m.STOCK_ADJUSTMENT_ROUTES),
  },
  {
    path: 'products',
    children: [
      {
        path: '',
        title: 'Products',
        data: { breadcrumbs: [MASTERS, { label: 'Products' }] },
        loadComponent: () => import('./products/product-list-page').then((m) => m.ProductListPage),
      },
      {
        path: 'new',
        title: 'New Product',
        data: { breadcrumbs: [MASTERS, PRODUCTS, { label: 'New' }] },
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./products/product-form-page').then((m) => m.ProductFormPage),
      },
      {
        path: ':id',
        title: 'Product Details',
        data: { breadcrumbs: [MASTERS, PRODUCTS, { label: 'Details' }] },
        loadComponent: () =>
          import('./products/product-detail-page').then((m) => m.ProductDetailPage),
      },
      {
        path: ':id/edit',
        title: 'Edit Product',
        data: { breadcrumbs: [MASTERS, PRODUCTS, { label: 'Edit' }] },
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./products/product-form-page').then((m) => m.ProductFormPage),
      },
    ],
  },
];
