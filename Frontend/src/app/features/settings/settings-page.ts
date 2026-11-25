import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { API_BASE_URL, DATA_SOURCE_MODE } from '../../core/data-access/data-source';
import { ApiHealthService } from '../../core/data-access/http/api-health.service';
import { MockDb } from '../../core/data-access/mock/mock-db';
import { toApiError } from '../../core/data-access/api.types';
import { ShopSettingsService } from '../../core/data-access/shop-settings.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { ToastService } from '../../core/services/toast.service';
import { logoColors } from '../../core/theme/logo-colors';
import { DEFAULT_THEME_COLOR, normalizeHex, resemblesDanger } from '../../core/theme/theme-palette';
import { ThemeService } from '../../core/theme/theme.service';
import { AddressFields } from '../../shared/components/address-fields/address-fields';
import { FormField } from '../../shared/components/form-field/form-field';
import { Icon } from '../../shared/components/icon/icon';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { AppValidators } from '../../shared/forms/app-validators';
import { injectFormSubmitter } from '../../shared/forms/form-submitter';
import { linkGstinWithState } from '../../shared/forms/gstin-state-link';
import { LOGO_ACCEPT, prepareLogo } from '../../shared/image/logo-image';
import { MobileInput } from '../../shared/forms/mobile-input.directive';
import { UppercaseInput } from '../../shared/forms/uppercase-input.directive';

@Component({
  selector: 'app-settings-page',
  imports: [
    ReactiveFormsModule,
    PageHeader,
    FormField,
    AddressFields,
    Icon,
    MobileInput,
    UppercaseInput,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
})
export class SettingsPage {
  private readonly settings = inject(ShopSettingsService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly health = inject(ApiHealthService);
  private readonly auth = inject(AuthService);
  private readonly theme = inject(ThemeService);

  protected readonly dataSourceMode = inject(DATA_SOURCE_MODE);
  protected readonly apiBaseUrl = inject(API_BASE_URL);
  protected readonly server = signal<{ state: 'checking' | 'up' | 'down'; message?: string }>({
    state: 'checking',
  });
  /** Tools for the in-browser demo data (only shown in 'mock' mode). */
  protected readonly mockDb = inject(MockDb);

  protected readonly form = inject(NonNullableFormBuilder).group({
    shopName: ['', [AppValidators.required, Validators.maxLength(100)]],
    phone: ['', AppValidators.mobile],
    email: ['', [AppValidators.email, Validators.maxLength(100)]],
    gstNumber: ['', [AppValidators.gstin, AppValidators.gstinMatchesState('state')]],
    address: ['', Validators.maxLength(250)],
    city: ['', Validators.maxLength(60)],
    state: [''],
    pincode: ['', AppValidators.pincode],
  });
  protected readonly submitter = injectFormSubmitter(this.form);

  /** The shop profile is printed on every bill, so only administrators may change it. */
  protected readonly canEditProfile = !this.auth.enabled || this.auth.isAdmin();
  protected readonly profileLoadError = signal<string | null>(null);
  /** The form shows a profile found in this browser's storage that is not on the server yet. */
  protected readonly importedFromBrowser = signal(false);

  /** Shop logo (saved on its own, straight away — not with the profile form). */
  protected readonly logo = this.settings.logo;
  protected readonly logoAccept = LOGO_ACCEPT;
  protected readonly logoBusy = signal(false);
  protected readonly logoError = signal<string | null>(null);
  protected readonly logoDragOver = signal(false);

  /** App colour theme (saved on its own, straight away; applies to every counter). */
  protected readonly themeColor = this.theme.color;
  protected readonly defaultThemeColor = DEFAULT_THEME_COLOR;
  /** Main colours found in the logo, most prominent first. */
  protected readonly logoPalette = signal<string[]>([]);
  protected readonly logoPaletteBusy = signal(false);
  protected readonly themeBusy = signal(false);
  protected readonly themeError = signal<string | null>(null);
  /** The theme is a colour picked by hand — neither the default nor one of the logo's. */
  protected readonly isCustomTheme = computed(
    () =>
      !!this.themeColor() &&
      !this.logoPaletteBusy() &&
      !this.logoPalette().includes(this.themeColor()),
  );
  protected readonly customPickerValue = computed(() =>
    (this.isCustomTheme() ? this.themeColor() : DEFAULT_THEME_COLOR).toLowerCase(),
  );
  protected readonly themeLooksLikeDanger = computed(() => resemblesDanger(this.themeColor()));
  private logoPaletteRun = 0;

  constructor() {
    linkGstinWithState(this.form.controls.gstNumber, this.form.controls.state, inject(DestroyRef));
    this.loadProfile();
    // Ask the server again, in case another counter changed the logo since this app was opened.
    void this.settings.loadLogo({ refresh: true });
    void this.theme.load();
    // Offer the colours of whichever logo is shown.
    effect(() => {
      const logo = this.logo();
      untracked(() => void this.readLogoColors(logo));
    });
    if (this.dataSourceMode === 'api') {
      this.checkServer();
    }
  }

  protected loadProfile(): void {
    this.profileLoadError.set(null);
    this.settings.getProfile().subscribe({
      next: (profile) => {
        // Earlier versions kept the profile in the browser — offer to move it to the server.
        const local =
          this.dataSourceMode === 'api' && !profile.shopName && this.canEditProfile
            ? this.settings.localProfile()
            : null;
        this.form.reset(local ?? profile);
        if (local) {
          this.form.markAsDirty();
          this.importedFromBrowser.set(true);
        }
        if (!this.canEditProfile) {
          this.form.disable();
        }
      },
      error: (error: unknown) =>
        this.profileLoadError.set(
          error instanceof Error ? error.message : 'The shop profile could not be loaded.',
        ),
    });
  }

  protected checkServer(): void {
    this.server.set({ state: 'checking' });
    this.health.check().subscribe({
      next: () => this.server.set({ state: 'up' }),
      error: (error: unknown) =>
        this.server.set({
          state: 'down',
          message: error instanceof Error ? error.message : 'The API is not reachable.',
        }),
    });
  }

  protected async saveProfile(): Promise<void> {
    const saved = await this.submitter.submit(() =>
      this.settings.saveProfile(this.form.getRawValue()),
    );
    if (saved) {
      this.importedFromBrowser.set(false);
      this.toast.success('Shop profile saved.');
    }
  }

  protected onLogoPicked(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = ''; // picking the same file again still fires (change)
    if (file) {
      void this.uploadLogo(file);
    }
  }

  protected onLogoDragOver(event: DragEvent): void {
    if (!this.canEditProfile || !event.dataTransfer?.types.includes('Files')) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    this.logoDragOver.set(true);
  }

  protected onLogoDrop(event: DragEvent): void {
    this.logoDragOver.set(false);
    if (!this.canEditProfile) {
      return;
    }
    event.preventDefault();
    const file = event.dataTransfer?.files[0];
    if (file) {
      void this.uploadLogo(file);
    }
  }

  private async uploadLogo(file: File): Promise<void> {
    if (this.logoBusy()) {
      return;
    }
    this.logoBusy.set(true);
    this.logoError.set(null);
    try {
      const hadLogo = !!this.logo();
      const saved = await firstValueFrom(this.settings.saveLogo(await prepareLogo(file)));
      let message = hadLogo ? 'Shop logo changed.' : 'Shop logo saved.';
      // Still on the built-in colours: switch to the logo's main colour.
      if (this.canEditProfile && !this.themeColor() && !this.themeBusy()) {
        const [main] = await this.readLogoColors(saved);
        if (main && (await this.applyTheme(main))) {
          message += ' The app now uses its colours (see Colour theme).';
        }
      }
      this.toast.success(message);
    } catch (error) {
      // Picture problems (LogoImageError) and API errors both carry a message for the user.
      this.logoError.set(toApiError(error).message);
    } finally {
      this.logoBusy.set(false);
    }
  }

  protected async chooseTheme(color: string): Promise<void> {
    const value = normalizeHex(color);
    if (!this.canEditProfile || this.themeBusy() || value === this.themeColor()) {
      return;
    }
    if (await this.applyTheme(value)) {
      this.toast.success(value ? 'Colour theme saved.' : 'Default colours restored.');
    }
  }

  /** Shows the colour at once and saves it; goes back to the saved one if saving fails. */
  private async applyTheme(color: string): Promise<boolean> {
    this.themeBusy.set(true);
    this.themeError.set(null);
    this.theme.preview(color);
    try {
      await firstValueFrom(this.theme.save(color));
      return true;
    } catch (error) {
      this.theme.preview(null);
      this.themeError.set(toApiError(error).message);
      return false;
    } finally {
      this.themeBusy.set(false);
    }
  }

  /** Finds the logo's main colours for the swatches (the latest logo wins). */
  private async readLogoColors(logo: string): Promise<string[]> {
    const run = ++this.logoPaletteRun;
    this.logoPaletteBusy.set(!!logo);
    let colors: string[] = [];
    try {
      colors = await logoColors(logo);
    } catch {
      // Unreadable picture — offer no logo colours.
    }
    if (run === this.logoPaletteRun) {
      this.logoPalette.set(colors);
      this.logoPaletteBusy.set(false);
    }
    return colors;
  }

  protected async removeLogo(): Promise<void> {
    const confirmed = await this.confirm.confirm({
      tone: 'danger',
      title: 'Remove the shop logo?',
      message: 'Bills and purchase orders will print without a logo.',
      confirmLabel: 'Remove logo',
    });
    if (!confirmed) {
      return;
    }
    this.logoBusy.set(true);
    this.logoError.set(null);
    try {
      await firstValueFrom(this.settings.removeLogo());
      this.toast.success('Shop logo removed.');
    } catch (error) {
      this.logoError.set(toApiError(error).message);
    } finally {
      this.logoBusy.set(false);
    }
  }

  protected toggleSimulatedErrors(enabled: boolean): void {
    this.mockDb.setSimulateErrors(enabled);
    if (enabled) {
      this.toast.warning(
        'API error simulation is on — data requests will fail until you turn it off.',
      );
    } else {
      this.toast.info('API error simulation is off.');
    }
  }

  protected async resetDemoData(): Promise<void> {
    const confirmed = await this.confirm.confirm({
      tone: 'danger',
      title: 'Reset demo data?',
      message:
        'All categories, brands, sizes, colours, suppliers, customers and products will be replaced with the original demo data. Changes you made will be lost.',
      confirmLabel: 'Reset data',
    });
    if (confirmed) {
      this.mockDb.resetToSeed();
      this.toast.success('Demo data restored.');
    }
  }
}
