import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { safeReturnUrl } from '../../core/auth/auth.guards';
import { AuthService, homeUrlFor } from '../../core/auth/auth.service';
import { FormField } from '../../shared/components/form-field/form-field';
import { Icon } from '../../shared/components/icon/icon';
import { AppValidators } from '../../shared/forms/app-validators';
import { injectFormSubmitter } from '../../shared/forms/form-submitter';

/**
 * Sign-in page. After signing in, users continue to the page they asked for (`returnUrl`), or
 * to their home page: the dashboard for administrators, billing for staff. Accounts that still
 * use a temporary password are sent to the change-password page first.
 */
@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, FormField, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth-layout.scss',
  templateUrl: './login-page.html',
})
export class LoginPage {
  /** Bound from the `?returnUrl=` query parameter. */
  readonly returnUrl = input<string | undefined>();

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly usernameInput = viewChild.required<ElementRef<HTMLInputElement>>('username');

  protected readonly showPassword = signal(false);
  protected readonly form = inject(NonNullableFormBuilder).group({
    username: ['', [AppValidators.required, Validators.maxLength(40)]],
    password: ['', [Validators.required, Validators.maxLength(128)]],
    remember: [false],
  });
  protected readonly submitter = injectFormSubmitter(this.form);

  constructor() {
    afterNextRender(() => this.usernameInput().nativeElement.focus());
  }

  protected async signIn(): Promise<void> {
    const { username, password, remember } = this.form.getRawValue();
    const user = await this.submitter.submit(() =>
      this.auth.login(username.trim(), password, remember),
    );
    if (!user) {
      return;
    }
    const returnUrl = this.returnUrl();
    if (user.mustChangePassword) {
      await this.router.navigate(['/account/password'], {
        queryParams: returnUrl ? { returnUrl } : {},
        replaceUrl: true,
      });
      return;
    }
    await this.router.navigateByUrl(safeReturnUrl(returnUrl, homeUrlFor(user)), {
      replaceUrl: true,
    });
  }
}
