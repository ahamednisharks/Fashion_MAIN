export type ColumnType = 'text' | 'status' | 'currency' | 'date' | 'number';

/**
 * Column definition for <app-data-table>.
 *
 * Rendering precedence: a matching `<ng-template appCell="key">` → built-in `type` → `value(row)`.
 */
export interface TableColumn<T> {
  /** Unique key; also the sort field and the name of an optional cell template. */
  readonly key: string;
  readonly label: string;
  readonly value?: (row: T) => string | number | null | undefined;
  readonly type?: ColumnType;
  readonly sortable?: boolean;
  readonly align?: 'start' | 'end' | 'center';
  readonly width?: string;
  /** Render as a button that triggers the row's "view" action. */
  readonly link?: boolean;
  /**
   * Card layout on phones: `title` spans the card header, `full` spans the card width,
   * `hidden` is omitted. Default: half-width labelled field.
   */
  readonly mobile?: 'title' | 'full' | 'hidden';
  /** Hide on narrower desktop widths to keep the table readable. */
  readonly hideBelow?: 'lg' | 'xl';
}

export type RowAction = 'view' | 'edit' | 'toggle' | 'delete';

export interface RowActionEvent<T> {
  readonly action: RowAction;
  readonly row: T;
}
