import { IconName } from '../../shared/components/icon/icon-registry';

export interface NavLink {
  readonly label: string;
  readonly icon: IconName;
  readonly route: string;
  /** Short tag shown next to the label, e.g. "Soon" for modules not built yet. */
  readonly tag?: string;
  /** Shown only to administrators (when sign-in is enabled). */
  readonly adminOnly?: boolean;
}

export interface NavGroup {
  readonly label: string;
  readonly icon: IconName;
  readonly children: readonly NavLink[];
  /** Shown only to administrators (when sign-in is enabled). */
  readonly adminOnly?: boolean;
}

export type NavEntry = NavLink | NavGroup;

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return 'children' in entry;
}

export const MASTER_LINKS: readonly NavLink[] = [
  { label: 'Categories', icon: 'tags', route: '/masters/categories' },
  { label: 'Brands', icon: 'award', route: '/masters/brands' },
  { label: 'Products', icon: 'box-seam', route: '/masters/products' },
  { label: 'Items', icon: 'list-ul', route: '/masters/items' },
  { label: 'Barcode Assign', icon: 'upc', route: '/masters/barcodes' },
  { label: 'Sizes', icon: 'rulers', route: '/masters/sizes' },
  { label: 'Colors', icon: 'palette', route: '/masters/colors' },
  { label: 'Suppliers', icon: 'truck', route: '/masters/suppliers' },
  { label: 'Customers', icon: 'people', route: '/masters/customers' },
];

/** Documents that move goods: purchase orders, purchase entries and stock adjustments. */
export const TRANSACTION_LINKS: readonly NavLink[] = [
  { label: 'Purchase Orders', icon: 'clipboard-check', route: '/purchase/orders' },
  { label: 'Purchase Entry', icon: 'box-arrow-in-right', route: '/purchase/entries' },
  { label: 'Stock Adjustment', icon: 'layers', route: '/masters/stock-adjustment' },
];

export const REPORT_LINKS: readonly NavLink[] = [
  { label: 'Sales Report', icon: 'graph-up', route: '/reports/sales' },
  { label: 'Customer-wise Sales', icon: 'people', route: '/reports/customer-sales', tag: 'Soon' },
  { label: 'Purchase Report', icon: 'cart3', route: '/reports/purchase', tag: 'Soon' },
  { label: 'Stock Report', icon: 'box-seam', route: '/reports/stock' },
];

export const NAV_ENTRIES: readonly NavEntry[] = [
  { label: 'Dashboard', icon: 'speedometer2', route: '/dashboard' },
  { label: 'Masters', icon: 'collection', children: MASTER_LINKS },
  { label: 'Billing', icon: 'receipt', route: '/billing' },
  { label: 'Transaction', icon: 'arrow-left-right', children: TRANSACTION_LINKS, adminOnly: true },
  { label: 'Reports', icon: 'bar-chart-line', children: REPORT_LINKS, adminOnly: true },
  { label: 'Users', icon: 'person-gear', route: '/users', adminOnly: true },
  { label: 'Settings', icon: 'gear', route: '/settings' },
];
