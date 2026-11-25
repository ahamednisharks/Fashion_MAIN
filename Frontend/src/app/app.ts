import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ConfirmHost } from './shared/components/confirm-host/confirm-host';
import { ToastHost } from './shared/components/toast-host/toast-host';

/** Root: the routed page plus the app-wide toast and confirmation hosts (also used on sign-in). */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastHost, ConfirmHost],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <router-outlet />
    <app-toast-host />
    <app-confirm-host />
  `,
})
export class App {}
