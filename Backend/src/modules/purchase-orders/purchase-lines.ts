import type { TransactionClient } from '../../config/database.js';
import { AppError } from '../../common/errors/app-error.js';
import { itemLabel } from '../sales/sales.service.js';
import type { SellableItem } from '../sales/sales.schema.js';
import type { PoSupplier, PurchaseOrdersRepository } from './purchase-orders.repository.js';

/*
 * Checks shared by purchase orders and purchase entries: the supplier and the item lines.
 */

/** productId|variantId — one line per item. */
export const purchaseItemKey = (productId: string, variantId: string | null) =>
  `${productId}|${variantId ?? ''}`;

/** How a purchase document is named in messages. */
export interface PurchaseDocumentWords {
  /** "purchase order" / "purchase entry" */
  readonly name: string;
  /** "ordered" / "received" */
  readonly verb: string;
}

interface PurchaseLineInput {
  readonly productId: string;
  readonly variantId: string | null;
  readonly quantity: number;
}

/**
 * The supplier must exist and be active. `keepSupplierId` is the supplier the document already
 * has — it may stay even if it was deactivated meanwhile.
 */
export async function checkPurchaseSupplier(
  repo: PurchaseOrdersRepository,
  tx: TransactionClient,
  id: string,
  keepSupplierId: string | null,
): Promise<PoSupplier> {
  const supplier = await repo.findSupplier(tx, id);
  if (!supplier) {
    throw AppError.validation('The selected supplier does not exist.', 'supplierId');
  }
  if (supplier.status !== 'active' && supplier.id !== keepSupplierId) {
    throw AppError.validation(
      `${supplier.name} is an inactive supplier. Activate the supplier or choose another.`,
      'supplierId',
    );
  }
  return supplier;
}

/**
 * Every line must be an existing item, listed once, active (unless its key is in
 * `keepInactive` — items already on the document being edited) and, except fabric, a whole
 * quantity.
 */
export async function checkPurchaseLines<L extends PurchaseLineInput>(
  repo: PurchaseOrdersRepository,
  tx: TransactionClient,
  items: readonly L[],
  words: PurchaseDocumentWords,
  keepInactive: ReadonlySet<string> = new Set(),
): Promise<{ input: L; item: SellableItem }[]> {
  const catalogue = await repo.findItemsOfProducts(
    tx,
    items.map((line) => line.productId),
  );
  const byKey = new Map(
    catalogue.map((item) => [purchaseItemKey(item.productId, item.variantId), item]),
  );
  const withVariants = new Set(
    catalogue.filter((item) => item.variantId).map((item) => item.productId),
  );
  const seen = new Map<string, number>();

  return items.map((line, index) => {
    const field = (name: string) => `items.${index}.${name}`;
    const key = purchaseItemKey(line.productId, line.variantId);
    const item = byKey.get(key);
    if (!item) {
      if (!line.variantId && withVariants.has(line.productId)) {
        throw AppError.validation(
          `Line ${index + 1}: choose a size / colour of this product.`,
          field('variantId'),
        );
      }
      throw AppError.validation(
        `Line ${index + 1}: this item no longer exists. Remove it from the ${words.name}.`,
        field('productId'),
      );
    }
    const label = itemLabel(item);
    const earlier = seen.get(key);
    if (earlier !== undefined) {
      throw AppError.validation(
        `${label} is on lines ${earlier + 1} and ${index + 1}. Keep one line and add the quantities.`,
        field('productId'),
      );
    }
    seen.set(key, index);
    if (item.status !== 'active' && !keepInactive.has(key)) {
      throw AppError.validation(
        `${label} is inactive and cannot be ${words.verb}. Remove it from the ${words.name}.`,
        field('productId'),
      );
    }
    if (item.productType !== 'fabric' && !Number.isInteger(line.quantity)) {
      throw AppError.validation(
        `${label}: quantity must be a whole number (decimals are only for fabric).`,
        field('quantity'),
      );
    }
    return { input: line, item };
  });
}
