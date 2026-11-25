import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { safeReturnUrl } from '../../core/auth/auth.guards';
import { AuthService, homeUrlFor } from '../../core/auth/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { FormField } from '../../shared/components/form-field/form-field';
import { Icon } from '../../shared/components/icon/icon';
import { AppValidators } from '../../shared/forms/app-validators';
import { injectFormSubmitter } from '../../shared/forms/form-submitter';
import { revalidateOnChange } from '../../shared/forms/form-utils';

/**
 * Change your own password. Required right after signing in with a temporary password (new
 * accounts, admin resets) — the API refuses everything else until it is done. Also reachable
 * from the profile menu. The server signs out the user's other sessions.
 */
@Component({
  selector: 'app-change-password-page',
  imports: [ReactiveFormsModule, FormField, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth-layout.scss',
  templateUrl: './change-password-page.html',
})
export class ChangePasswordPage {
  /** Bound from the `?returnUrl=` query parameter. */
  readonly returnUrl = input<string | undefined>();

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  /** The route guard has already loaded the user. */
  protected readonly user = this.auth.user();
  /** True when the user signed in with a temporary password and must replace it. */
  protected readonly forced = this.user?.mustChangePassword ?? false;
  protected readonly showPasswords = signal(false);

  protected readonly form = inject(NonNullableFormBuilder).group({
    currentPassword: ['', [Validators.required, Validators.maxLength(128)]],
    newPassword: [
      '',
      [
        Validators.required,
        Validators.minLength(8),
        Validators.maxLength(128),
        AppValidators.passwordStrength,
        this.notContainingUsername(),
        this.differentFrom('currentPassword'),
      ],
    ],
    confirmPassword: ['', [Validators.required, AppValidators.matches('newPassword')]],
  });
  protected readonly submitter = injectFormSubmitter(this.form);

  constructor() {
    const { currentPassword, newPassword, confirmPassword } = this.form.controls;
    const destroyRef = inject(DestroyRef);
    revalidateOnChange(newPassword, [currentPassword], destroyRef);
    revalidateOnChange(confirmPassword, [newPassword], destroyRef);
  }

  protected async save(): Promise<void> {
    const { currentPassword, newPassword } = this.form.getRawValue();
    const user = await this.submitter.submit(() =>
      this.auth.changePassword(currentPassword, newPassword),
    );
    if (user) {
      this.toast.success('Your password has been changed.');
      await this.router.navigateByUrl(safeReturnUrl(this.returnUrl(), homeUrlFor(user)), {
        replaceUrl: true,
      });
    }
  }

  protected cancel(): void {
    void this.router.navigateByUrl(safeReturnUrl(this.returnUrl(), homeUrlFor(this.user)));
  }

  protected async signOut(): Promise<void> {
    await this.auth.logout();
    await this.router.navigate(['/login'], { replaceUrl: true });
  }

  private notContainingUsername(): ValidatorFn {
    const username = this.user?.username.toLowerCase() ?? '';
    return (control: AbstractControl) => {
      const value: unknown = control.value;
      return username && typeof value === 'string' && value.toLowerCase().includes(username)
        ? { containsUsername: true }
        : null;
    };
  }

  private differentFrom(otherControlName: string): ValidatorFn {
    return (control: AbstractControl) => {
      const value: unknown = control.value;
      return value && value === control.parent?.get(otherControlName)?.value
        ? { samePassword: true }
        : null;
    };
  }
}
