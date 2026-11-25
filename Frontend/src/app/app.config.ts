import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import localeEnIn from '@angular/common/locales/en-IN';
import {
  ApplicationConfig,
  LOCALE_ID,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  TitleStrategy,
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
} from '@angular/router';

import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { provideDataSource } from './core/data-access/provide-data-source';
import { AppTitleStrategy } from './core/services/page-meta.service';
import { ThemeService } from './core/theme/theme.service';

// Indian number formatting (₹1,23,456.00) for currency and number pipes.
registerLocaleData(localeEnIn);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }),
    ),
    { provide: LOCALE_ID, useValue: 'en-IN' },
    { provide: TitleStrategy, useClass: AppTitleStrategy },
    // XSRF protection is on by default: Angular copies the XSRF-TOKEN cookie into the
    // X-XSRF-TOKEN header of same-origin state-changing requests (checked by the backend).
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    // Master data from the REST API ('/api/v1', proxied to the backend in development).
    // Use provideDataSource('mock') to run on in-browser demo data without a backend.
    provideDataSource('api'),
    // Shop colour theme: the last one seen applies at once, then the server's copy (not awaited).
    provideAppInitializer(() => {
      void inject(ThemeService).load();
    }),
  ],
};
