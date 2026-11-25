import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ControlContainer, ReactiveFormsModule } from '@angular/forms';

import { STATE_NAMES } from '../../forms/app-validators';
import { FormField } from '../form-field/form-field';

/**
 * Address, City, State and Pincode fields bound to the parent form group
 * (controls: address, city, state, pincode). Renders into the parent's `.form-grid`.
 */
@Component({
  selector: 'app-address-fields',
  imports: [ReactiveFormsModule, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [
    { provide: ControlContainer, useFactory: () => inject(ControlContainer, { skipSelf: true }) },
  ],
  host: { style: 'display: contents' },
  template: `
    <app-form-field label="Address" class="span-full">
      <textarea
        class="form-control"
        formControlName="address"
        rows="2"
        maxlength="250"
        autocomplete="street-address"
      ></textarea>
    </app-form-field>
    <app-form-field label="City">
      <input
        class="form-control"
        formControlName="city"
        maxlength="60"
        autocomplete="address-level2"
      />
    </app-form-field>
    <app-form-field label="State">
      <select class="form-control" formControlName="state" autocomplete="address-level1">
        <option value="">Select state</option>
        @for (state of states; track state) {
          <option [value]="state">{{ state }}</option>
        }
      </select>
    </app-form-field>
    <app-form-field label="Pincode">
      <input
        class="form-control"
        formControlName="pincode"
        inputmode="numeric"
        maxlength="6"
        autocomplete="postal-code"
        placeholder="6 digits"
      />
    </app-form-field>
  `,
})
export class AddressFields {
  protected readonly states = STATE_NAMES;
}
