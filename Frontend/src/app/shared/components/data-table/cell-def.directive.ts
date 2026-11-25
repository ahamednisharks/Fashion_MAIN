import { Directive, TemplateRef, inject, input } from '@angular/core';

export interface CellContext<T> {
  $implicit: T;
}

/**
 * Custom cell template for a data-table column.
 *
 *   <ng-template appCell="name" [appCellOf]="rows" let-row>{{ row.name }}</ng-template>
 *
 * `appCellOf` is only used for type inference, so `row` is strongly typed in the template.
 */
@Directive({ selector: 'ng-template[appCell]' })
export class CellDef<T> {
  readonly column = input.required<string>({ alias: 'appCell' });
  readonly rows = input<readonly T[]>([], { alias: 'appCellOf' });
  readonly template = inject<TemplateRef<CellContext<T>>>(TemplateRef);

  static ngTemplateContextGuard<T>(
    _directive: CellDef<T>,
    context: unknown,
  ): context is CellContext<T> {
    return true;
  }
}
