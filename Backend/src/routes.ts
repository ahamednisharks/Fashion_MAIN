import type { ApiModule } from './common/http/route.js';
import { authModule } from './modules/auth/auth.routes.js';
import { brandsModule } from './modules/brands/brands.routes.js';
import { categoriesModule } from './modules/categories/categories.routes.js';
import { colorsModule } from './modules/colors/colors.routes.js';
import { customersModule } from './modules/customers/customers.routes.js';
import { healthModule } from './modules/health/health.routes.js';
import { barcodeSettingsModule, itemsModule } from './modules/items/items.routes.js';
import { productsModule } from './modules/products/products.routes.js';
import { reportsModule } from './modules/reports/reports.routes.js';
import { variantsModule } from './modules/products/variants/variants.routes.js';
import { purchaseEntriesModule } from './modules/purchase-entries/purchase-entries.routes.js';
import { purchaseOrdersModule } from './modules/purchase-orders/purchase-orders.routes.js';
import { salesModule } from './modules/sales/sales.routes.js';
import { shopSettingsModule } from './modules/settings/shop-settings.routes.js';
import { sizesModule } from './modules/sizes/sizes.routes.js';
import { stockAdjustmentsModule } from './modules/stock-adjustments/stock-adjustments.routes.js';
import { stockModule } from './modules/stock/stock.routes.js';
import { suppliersModule } from './modules/suppliers/suppliers.routes.js';
import { usersModule } from './modules/users/users.routes.js';

/**
 * Every API module, mounted under /api/v1 and documented in Swagger in this order.
 * Routes require a signed-in user unless the module / route says otherwise.
 */
export const API_MODULES: readonly ApiModule[] = [
  healthModule,
  authModule,
  usersModule,
  categoriesModule,
  brandsModule,
  sizesModule,
  colorsModule,
  suppliersModule,
  customersModule,
  productsModule,
  variantsModule,
  itemsModule,
  stockModule,
  shopSettingsModule,
  barcodeSettingsModule,
  salesModule,
  purchaseOrdersModule,
  purchaseEntriesModule,
  stockAdjustmentsModule,
  reportsModule,
];
