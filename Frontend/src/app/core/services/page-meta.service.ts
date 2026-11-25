import { Injectable, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

export interface Breadcrumb {
  readonly label: string;
  readonly link?: string;
}

export interface PageMeta {
  readonly title: string;
  readonly breadcrumbs: readonly Breadcrumb[];
}

const APP_NAME = 'Fashion';

/** Current page title + breadcrumbs shown in the header. Driven by route `title` and `data.breadcrumbs`. */
@Injectable({ providedIn: 'root' })
export class PageMetaService {
  private readonly documentTitle = inject(Title);
  private readonly state = signal<PageMeta>({ title: '', breadcrumbs: [] });
  readonly meta = this.state.asReadonly();

  set(meta: PageMeta): void {
    this.state.set(meta);
    this.documentTitle.setTitle(meta.title ? `${meta.title} · ${APP_NAME}` : APP_NAME);
  }

  /** Replaces the title for the current page (e.g. with a product name once loaded). */
  setTitle(title: string): void {
    const current = this.state();
    const breadcrumbs = current.breadcrumbs.length
      ? [...current.breadcrumbs.slice(0, -1), { label: title }]
      : [];
    this.set({ title, breadcrumbs });
  }
}

/** Feeds route titles and breadcrumbs into PageMetaService on every navigation. */
@Injectable()
export class AppTitleStrategy extends TitleStrategy {
  private readonly pageMeta = inject(PageMetaService);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    let route = snapshot.root;
    while (route.firstChild) {
      route = route.firstChild;
    }
    const title = this.buildTitle(snapshot) ?? '';
    const data: unknown = route.data['breadcrumbs'];
    const breadcrumbs = Array.isArray(data) ? (data as Breadcrumb[]) : [{ label: title }];
    this.pageMeta.set({ title, breadcrumbs });
  }
}
