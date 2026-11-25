import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { ICON_REGISTRY, IconName } from './icon-registry';

const cache = new Map<IconName, SafeHtml>();

/**
 * Inline SVG icon from the generated Bootstrap Icons registry. Sized by font-size (1em) and
 * coloured by currentColor. Decorative by default — label the surrounding button instead.
 */
@Component({
  selector: 'app-icon',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'app-icon',
    'aria-hidden': 'true',
    '[innerHTML]': 'svg()',
  },
})
export class Icon {
  readonly name = input.required<IconName>();

  private readonly sanitizer = inject(DomSanitizer);

  protected readonly svg = computed(() => {
    const name = this.name();
    let html = cache.get(name);
    if (!html) {
      // Safe: markup comes from the build-time registry, never from user input.
      html = this.sanitizer.bypassSecurityTrustHtml(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" focusable="false">${ICON_REGISTRY[name]}</svg>`,
      );
      cache.set(name, html);
    }
    return html;
  });
}
