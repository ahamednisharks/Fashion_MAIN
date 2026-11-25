import { InjectionToken, Signal, WritableSignal } from '@angular/core';

import { SupplyType } from '../../../core/models/sale.model';
import { Supplier } from '../../../core/models/supplier.model';
import { stateFromGstin } from '../../../core/utils/gstin';

/** The supplier fields a purchase document needs (a full Supplier, or a saved snapshot). */
export type PurchaseSupplier = Pick<
  Supplier,
  'id' | 'name' | 'mobile' | 'gstNumber' | 'state' | 'status'
> & { address: string };

/**
 * CGST + SGST when the supplier is in the shop's state (or either state is unknown), IGST when
 * the supplier is in another state. Mirrors poSupplyTypeFor() in the backend.
 */
export function poSupplyTypeFor(
  shopState: string,
  supplier: Pick<Supplier, 'gstNumber' | 'state'> | null,
): SupplyType {
  if (!supplier) {
    return 'intra';
  }
  const supplierState =
    (supplier.gstNumber && stateFromGstin(supplier.gstNumber)?.name) || supplier.state;
  return shopState && supplierState && supplierState !== shopState ? 'inter' : 'intra';
}

/** "12 Main Road, Coimbatore - 641001" (same as the backend snapshot). */
export function supplierAddress(supplier: Pick<Supplier, 'address' | 'city' | 'pincode'>): string {
  const cityLine = [supplier.city, supplier.pincode].filter(Boolean).join(' - ');
  return [supplier.address, cityLine].filter(Boolean).join(', ');
}

/** The document store the supplier picker reads and writes (PO or purchase entry). */
export interface SupplierPickerHost {
  readonly supplier: WritableSignal<PurchaseSupplier | null>;
  readonly supplyType: Signal<SupplyType>;
  readonly shopState: Signal<string>;
}

export const SUPPLIER_PICKER_HOST = new InjectionToken<SupplierPickerHost>('SUPPLIER_PICKER_HOST');
