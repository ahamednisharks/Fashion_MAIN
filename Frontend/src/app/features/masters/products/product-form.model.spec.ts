import { TestBed } from '@angular/core/testing';
import { NonNullableFormBuilder } from '@angular/forms';

import {
  VariantRowIssues,
  createProductForm,
  createVariantGroup,
  suggestProductCode,
  toProductInput,
} from './product-form.model';

describe('product form model', () => {
  let fb: NonNullableFormBuilder;

  beforeEach(() => {
    fb = TestBed.inject(NonNullableFormBuilder);
  });

  function formWithVariants(...variants: Parameters<typeof createVariantGroup>[1][]) {
    const form = createProductForm(fb);
    form.patchValue({ mrp: 1000, sellingPrice: 900 });
    variants.forEach((variant) => form.controls.variants.push(createVariantGroup(fb, variant)));
    return form;
  }

  function rowIssues(form: ReturnType<typeof createProductForm>): VariantRowIssues {
    return form.controls.variants.errors?.['variantRows'] ?? {};
  }

  it('flags repeated design/size/colour combinations and SKUs', () => {
    const form = formWithVariants(
      { designNo: '101', sizeId: 's', colorId: 'c', sku: 'A-1' },
      { designNo: ' 101 ', sizeId: 's', colorId: 'c', sku: 'a-1' },
    );
    expect(rowIssues(form)[1]).toEqual([
      'Same design, size and colour as variant 1.',
      'SKU is the same as variant 1.',
    ]);
    expect(rowIssues(form)[0]).toBeUndefined();
  });

  it('checks selling price against MRP after overrides', () => {
    const form = formWithVariants(
      { sizeId: 's1', colorId: 'c', sku: 'A-1', sellingPrice: 1200 },
      { sizeId: 's2', colorId: 'c', sku: 'A-2', sellingPrice: 1200, mrp: 1500 },
    );
    expect(rowIssues(form)[0]).toEqual(['Selling price is more than MRP for this variant.']);
    expect(rowIssues(form)[1]).toBeUndefined();
  });

  it('re-validates when the base MRP changes', () => {
    const form = formWithVariants({ sizeId: 's', colorId: 'c', sku: 'A-1' });
    form.controls.sellingPrice.setValue(1100);
    form.controls.variants.updateValueAndValidity();
    expect(rowIssues(form)[0]).toEqual(['Selling price is more than MRP for this variant.']);
  });

  it('maps the form to an API payload (new variants have no id)', () => {
    const form = formWithVariants(
      { id: 'v1', sizeId: 's', colorId: 'c', sku: 'A-1' },
      { sizeId: 's', colorId: 'c2', sku: 'A-2' },
    );
    const input = toProductInput(form);
    expect(input.mrp).toBe(1000);
    expect(input.variants[0].id).toBe('v1');
    expect('id' in input.variants[1]).toBe(false);
  });

  it('suggests a code from the category name', () => {
    expect(suggestProductCode("Men's Shirts")).toMatch(/^MS-\d{4}$/);
    expect(suggestProductCode('Sarees')).toMatch(/^SAR-\d{4}$/);
    expect(suggestProductCode('')).toMatch(/^PRD-\d{4}$/);
  });
});
