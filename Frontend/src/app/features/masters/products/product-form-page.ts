import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';

import { toApiError } from '../../../core/data-access/api.types';
import { ProductService } from '../../../core/data-access/product.service';
import { STATUS_OPTIONS } from '../../../core/models/base.model';
import { GST_RATES, PRODUCT_TYPE_OPTIONS, Product } from '../../../core/models/product.model';
import { ToastService } from '../../../core/services/toast.service';
import { FormField } from '../../../shared/components/form-field/form-field';
import { Icon } from '../../../shared/components/icon/icon';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { SegmentedControl } from '../../../shared/components/segmented-control/segmented-control';
import { EmptyState, ErrorState } from '../../../shared/components/state-views/state-views';
import { AppValidators } from '../../../shared/forms/app-validators';
import { injectFormSubmitter } from '../../../shared/forms/form-submitter';
import { revalidateOnChange } from '../../../shared/forms/form-utils';
import { UppercaseInput } from '../../../shared/forms/uppercase-input.directive';
import { HasUnsavedChanges } from '../../../shared/guards/unsaved-changes.guard';
import {
  createProductForm,
  patchProductForm,
  suggestProductCode,
  toProductInput,
} from './product-form.model';
import { ProductLookups, ProductLookupsService, selectableOptions } from './product-lookups';
import { VariantEditor } from './variant-editor';

type LoadState = 'loading' | 'ready' | 'error' | 'not-found';

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

@Component({
  selector: 'app-product-form-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    PageHeader,
    FormField,
    SegmentedControl,
    Icon,
    ErrorState,
    EmptyState,
    UppercaseInput,
    VariantEditor,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-form-page.html',
  styleUrl: './product-form-page.scss',
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
})
export class ProductFormPage implements HasUnsavedChanges {
  /** Route param — undefined when creating a new product. */
  readonly id = input<string>();
  /** Query param ?variant= (from the Items screen): that variant row is highlighted. */
  readonly variant = input<string>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly productService = inject(ProductService);
  private readonly lookupsService = inject(ProductLookupsService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  protected readonly form = createProductForm(this.fb);
  protected readonly submitter = injectFormSubmitter(this.form);

  protected readonly state = signal<LoadState>('loading');
  protected readonly loadError = signal('');
  protected readonly lookups = signal<ProductLookups | null>(null);
  protected readonly product = signal<Product | null>(null);
  protected readonly isEdit = computed(() => !!this.id());

  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly typeOptions = PRODUCT_TYPE_OPTIONS;
  protected readonly gstRates = GST_RATES;

  /** Dropdown options: active records plus whatever the product already uses. */
  protected readonly options = computed(() => {
    const lookups = this.lookups();
    const product = this.product();
    if (!lookups) {
      return { categories: [], brands: [], sizes: [], colors: [] };
    }
    const used = (ids: (string | undefined)[]) => new Set(ids.filter((id): id is string => !!id));
    return {
      categories: selectableOptions(lookups.categories, used([product?.categoryId])),
      brands: selectableOptions(lookups.brands, used([product?.brandId])),
      sizes: selectableOptions(lookups.sizes, used(product?.variants.map((v) => v.sizeId) ?? [])),
      colors: selectableOptions(
        lookups.colors,
        used(product?.variants.map((v) => v.colorId) ?? []),
      ),
    };
  });

  constructor() {
    const { controls } = this.form;
    controls.code.addAsyncValidators(
      AppValidators.unique((code) => this.productService.isTaken('code', code, this.id())),
    );
    revalidateOnChange(controls.sellingPrice, [controls.mrp], this.destroyRef);
    revalidateOnChange(
      controls.variants,
      [controls.mrp, controls.sellingPrice, controls.barcode],
      this.destroyRef,
    );

    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
  }

  hasUnsavedChanges(): boolean {
    return this.form.dirty && !this.submitter.saving();
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) {
      event.preventDefault();
    }
  }

  protected load(id = this.id()): void {
    this.state.set('loading');
    forkJoin({
      lookups: this.lookupsService.load(),
      product: id ? this.productService.getById(id) : of(null),
    }).subscribe({
      next: ({ lookups, product }) => {
        this.lookups.set(lookups);
        this.product.set(product);
        if (product) {
          patchProductForm(this.form, product, this.fb);
        }
        this.state.set('ready');
        this.revealVariant();
      },
      error: (error: unknown) => {
        const apiError = toApiError(error);
        this.loadError.set(apiError.message);
        this.state.set(apiError.code === 'NOT_FOUND' ? 'not-found' : 'error');
      },
    });
  }

  /** Scrolls the variant named in the URL into view (once the form has rendered). */
  private revealVariant(): void {
    const variantId = this.variant();
    if (!variantId) {
      return;
    }
    afterNextRender(
      () =>
        document
          .querySelector(`[data-variant-id="${CSS.escape(variantId)}"]`)
          ?.scrollIntoView({ block: 'center' }),
      { injector: this.injector },
    );
  }

  protected inactiveSuffix(status: string): string {
    return status === 'inactive' ? ' (inactive)' : '';
  }

  protected generateCode(): void {
    const categoryId = this.form.controls.categoryId.value;
    const category = this.lookups()?.categories.find((c) => c.id === categoryId);
    const control = this.form.controls.code;
    control.setValue(suggestProductCode(category?.name ?? ''));
    control.markAsDirty();
    control.markAsTouched();
  }

  protected marginHint(): string {
    const { sellingPrice, purchasePrice } = this.form.controls;
    const selling = sellingPrice.value;
    const purchase = purchasePrice.value;
    if (selling && purchase !== null && selling > 0) {
      const margin = selling - purchase;
      return `Margin ${inr.format(margin)} (${((margin / selling) * 100).toFixed(1)}%)`;
    }
    return 'Price at the counter, inclusive of GST.';
  }

  protected async save(): Promise<void> {
    const id = this.id();
    const result = await this.submitter.submit(() => {
      const input = toProductInput(this.form);
      return id ? this.productService.update(id, input) : this.productService.create(input);
    });
    if (result) {
      this.toast.success(`Product "${result.name}" ${id ? 'updated' : 'created'}.`);
      void this.router.navigate(['/masters/products', result.id]);
    }
  }
}
