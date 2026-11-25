/**
 * User-facing messages for database constraints (names defined in database/migrations).
 * Services pre-check most rules for nicer messages; these are the safety net that keeps
 * responses friendly even under concurrent writes.
 */
export interface ConstraintMessage {
  /** API field the constraint relates to. */
  readonly field?: string;
  readonly message: string;
  /** For foreign keys: message when a referenced row cannot be deleted. */
  readonly inUseMessage?: string;
}

export const CONSTRAINT_MESSAGES: Readonly<Record<string, ConstraintMessage>> = {
  // Unique
  categories_name_key: { field: 'name', message: 'A category with this name already exists.' },
  brands_name_key: { field: 'name', message: 'A brand with this name already exists.' },
  sizes_name_key: { field: 'name', message: 'A size with this name already exists.' },
  colors_name_key: { field: 'name', message: 'A colour with this name already exists.' },
  suppliers_name_key: { field: 'name', message: 'A supplier with this name already exists.' },
  suppliers_gst_number_key: {
    field: 'gstNumber',
    message: 'Another supplier already uses this GST number.',
  },
  customers_mobile_key: {
    field: 'mobile',
    message: 'Another customer already uses this mobile number.',
  },
  customers_gst_number_key: {
    field: 'gstNumber',
    message: 'Another customer already uses this GST number.',
  },
  products_code_key: { field: 'code', message: 'Another product already uses this product code.' },
  products_barcode_key: { field: 'barcode', message: 'This barcode is already in use.' },
  product_variants_sku_key: {
    field: 'sku',
    message: 'This SKU is already used by another variant.',
  },
  product_variants_barcode_key: { field: 'barcode', message: 'This barcode is already in use.' },
  product_variants_combo_key: {
    field: 'sizeId',
    message: 'A variant with the same design, size and colour already exists for this product.',
  },

  // Foreign keys
  products_category_id_fkey: {
    field: 'categoryId',
    message: 'The selected category does not exist.',
    inUseMessage: 'This category is used by products.',
  },
  products_brand_id_fkey: {
    field: 'brandId',
    message: 'The selected brand does not exist.',
    inUseMessage: 'This brand is used by products.',
  },
  product_variants_size_id_fkey: {
    field: 'sizeId',
    message: 'The selected size does not exist.',
    inUseMessage: 'This size is used by product variants.',
  },
  product_variants_color_id_fkey: {
    field: 'colorId',
    message: 'The selected colour does not exist.',
    inUseMessage: 'This colour is used by product variants.',
  },
  product_variants_product_id_fkey: { field: 'productId', message: 'The product does not exist.' },
  // Billing — bills are kept for GST records, so billed masters can only be deactivated.
  sales_invoices_customer_id_fkey: {
    field: 'customerId',
    message: 'The selected customer does not exist.',
    inUseMessage: 'This customer has bills and cannot be deleted. Deactivate the customer instead.',
  },
  sales_invoices_created_by_fkey: {
    message: 'The billing user does not exist.',
    inUseMessage:
      'This user has created bills and cannot be deleted. Deactivate the account instead.',
  },
  sales_invoice_items_product_id_fkey: {
    field: 'productId',
    message: 'The product does not exist.',
    inUseMessage: 'This product has been billed and cannot be deleted. Deactivate it instead.',
  },
  sales_invoice_items_variant_id_fkey: {
    field: 'variantId',
    message: 'The variant does not exist.',
    inUseMessage:
      'A variant that has been billed cannot be deleted. Keep the variant, or deactivate the product instead.',
  },

  // Purchase orders — kept for records (cancel instead of delete), so their masters can only be
  // deactivated.
  purchase_orders_supplier_id_fkey: {
    field: 'supplierId',
    message: 'The selected supplier does not exist.',
    inUseMessage:
      'This supplier has purchase orders and cannot be deleted. Deactivate the supplier instead.',
  },
  purchase_orders_created_by_fkey: {
    message: 'The user does not exist.',
    inUseMessage:
      'This user has created purchase orders and cannot be deleted. Deactivate the account instead.',
  },
  purchase_order_items_product_id_fkey: {
    field: 'productId',
    message: 'The product does not exist.',
    inUseMessage:
      'This product is on purchase orders and cannot be deleted. Deactivate it instead.',
  },
  purchase_order_items_variant_id_fkey: {
    field: 'variantId',
    message: 'The variant does not exist.',
    inUseMessage:
      'A variant that is on purchase orders cannot be deleted. Keep the variant, or deactivate the product instead.',
  },
  purchase_orders_expected_date_check: {
    field: 'expectedDate',
    message: 'Expected date cannot be before the PO date.',
  },

  // Purchase entries — kept for records (cancel instead of delete), like purchase orders.
  purchase_entries_supplier_id_fkey: {
    field: 'supplierId',
    message: 'The selected supplier does not exist.',
    inUseMessage:
      'This supplier has purchase entries and cannot be deleted. Deactivate the supplier instead.',
  },
  purchase_entries_created_by_fkey: {
    message: 'The user does not exist.',
    inUseMessage:
      'This user has created purchase entries and cannot be deleted. Deactivate the account instead.',
  },
  purchase_entries_po_id_fkey: {
    field: 'purchaseOrderId',
    message: 'The selected purchase order does not exist.',
    inUseMessage: 'Goods have been received against this purchase order.',
  },
  purchase_entry_items_product_id_fkey: {
    field: 'productId',
    message: 'The product does not exist.',
    inUseMessage:
      'This product is on purchase entries and cannot be deleted. Deactivate it instead.',
  },
  purchase_entry_items_variant_id_fkey: {
    field: 'variantId',
    message: 'The variant does not exist.',
    inUseMessage:
      'A variant that is on purchase entries cannot be deleted. Keep the variant, or deactivate the product instead.',
  },
  purchase_entries_supplier_invoice_key: {
    field: 'supplierInvoiceNo',
    message: 'This supplier invoice has already been entered this financial year.',
  },
  purchase_entries_supplier_invoice_date_check: {
    field: 'supplierInvoiceDate',
    message: 'The supplier invoice date cannot be after the received date.',
  },
  purchase_entry_items_selling_price_check: {
    message: 'Selling price cannot be more than MRP.',
  },

  // Stock — movements keep the item (deactivate instead of deleting).
  stock_movements_product_id_fkey: {
    field: 'productId',
    message: 'The product does not exist.',
    inUseMessage: 'This product has stock movements and cannot be deleted. Deactivate it instead.',
  },
  stock_movements_variant_id_fkey: {
    field: 'variantId',
    message: 'The variant does not exist.',
    inUseMessage:
      'A variant with stock movements cannot be deleted. Keep the variant, or deactivate the product instead.',
  },

  // Checks
  products_selling_price_check: {
    field: 'sellingPrice',
    message: 'Selling price cannot be more than MRP.',
  },
  colors_hex_code_check: { field: 'hexCode', message: 'Enter a valid HEX colour code.' },
};
