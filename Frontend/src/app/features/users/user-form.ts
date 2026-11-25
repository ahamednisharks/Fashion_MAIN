import { ChangeDetectionStrategy, Component, OnInit, inject, input, output } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { UserService } from '../../core/data-access/user.service';
import {
  AppUser,
  ROLE_OPTIONS,
  UserRole,
  UserWithTemporaryPassword,
} from '../../core/models/user.model';
import { FormFooter } from '../../shared/components/form-footer/form-footer';
import { FormField } from '../../shared/components/form-field/form-field';
import { Icon } from '../../shared/components/icon/icon';
import { SegmentedControl } from '../../shared/components/segmented-control/segmented-control';
import { AppValidators } from '../../shared/forms/app-validators';
import { injectModalForm } from '../../shared/forms/form-submitter';
import { LowercaseInput } from '../../shared/forms/lowercase-input.directive';

/** Add / edit a user account. New accounts get a one-time temporary password from the server. */
@Component({
  selector: 'app-user-form',
  imports: [ReactiveFormsModule, FormField, FormFooter, SegmentedControl, Icon, LowercaseInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <form class="modal-form" [formGroup]="form" (ngSubmit)="save()" novalidate>
      <div class="modal-body">
        @if (controller.error(); as message) {
          <div class="alert alert-danger form-alert" role="alert">
            <app-icon name="exclamation-triangle-fill" /><span>{{ message }}</span>
          </div>
        }
        <div class="form-grid">
          <app-form-field label="Full Name" hint="Shown in the header and on bills they create.">
            <input
              class="form-control"
              formControlName="fullName"
              maxlength="100"
              autocomplete="off"
              placeholder="e.g. Priya Sharma"
              autofocus
            />
          </app-form-field>
          <app-form-field
            label="Username"
            [hint]="
              user()
                ? 'Usernames cannot be changed.'
                : 'Used to sign in. Lower-case letters, numbers, dot, hyphen or underscore.'
            "
          >
            <input
              class="form-control mono"
              formControlName="username"
              maxlength="40"
              autocomplete="off"
              placeholder="e.g. priya"
              appLowercase
            />
          </app-form-field>
          <app-form-field
            label="Role"
            [hint]="
              isSelf()
                ? 'You cannot change your own role.'
                : 'Administrators can manage masters, users and settings. Staff open billing.'
            "
          >
            <app-segmented-control formControlName="role" [options]="roleOptions" ariaLabel="Role" />
          </app-form-field>
          @if (!user()) {
            <div class="alert alert-info" role="note">
              <app-icon name="info-circle-fill" />
              <span>
                A temporary password is created for the new user. They must choose their own
                password the first time they sign in.
              </span>
            </div>
          }
        </div>
      </div>
      <app-form-footer
        [saving]="controller.saving()"
        [submitLabel]="user() ? 'Save changes' : 'Add user'"
        (cancel)="controller.cancel()"
      />
    </form>
  `,
})
export class UserForm implements OnInit {
  readonly user = input<AppUser | null>(null);
  /** True when editing the signed-in administrator's own account. */
  readonly isSelf = input(false);
  readonly created = output<UserWithTemporaryPassword>();
  readonly updated = output<AppUser>();

  private readonly service = inject(UserService);
  protected readonly roleOptions = ROLE_OPTIONS;

  protected readonly form = inject(NonNullableFormBuilder).group({
    fullName: ['', [AppValidators.required, Validators.maxLength(100)]],
    username: [
      '',
      {
        validators: [AppValidators.required, AppValidators.username],
        asyncValidators: [
          AppValidators.unique((username) =>
            this.service.isTaken(username.toLowerCase(), this.user()?.id),
          ),
        ],
      },
    ],
    role: ['staff' as UserRole],
  });

  protected readonly controller = injectModalForm(this.form);

  ngOnInit(): void {
    const user = this.user();
    if (user) {
      this.form.reset({ fullName: user.fullName, username: user.username, role: user.role });
      this.form.controls.username.disable();
      if (this.isSelf()) {
        this.form.controls.role.disable();
      }
    }
  }

  protected async save(): Promise<void> {
    const { fullName, username, role } = this.form.getRawValue();
    const user = this.user();
    if (user) {
      const result = await this.controller.submit(() =>
        this.service.update(user.id, { fullName: fullName.trim(), role }),
      );
      if (result) {
        this.updated.emit(result);
      }
      return;
    }
    const result = await this.controller.submit(() =>
      this.service.create({
        fullName: fullName.trim(),
        username: username.trim().toLowerCase(),
        role,
      }),
    );
    if (result) {
      this.created.emit(result);
    }
  }
}
