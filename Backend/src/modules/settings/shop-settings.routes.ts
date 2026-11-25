import { type ApiModule, defineRoute } from '../../common/http/route.js';
import { ShopSettingsRepository } from './shop-settings.repository.js';
import {
  MAX_LOGO_BYTES,
  shopLogoInputSchema,
  shopLogoSchema,
  shopProfileInputSchema,
  shopProfileSchema,
  shopThemeInputSchema,
  shopThemeSchema,
} from './shop-settings.schema.js';

const repository = new ShopSettingsRepository();

export const shopSettingsModule: ApiModule = {
  basePath: '/settings',
  tag: 'Settings',
  description:
    'Shop profile and logo printed on bills (name, address, GSTIN, state), and the app colour theme.',
  routes: [
    defineRoute({
      method: 'get',
      path: '/shop',
      summary: 'Get the shop profile',
      schemas: {},
      success: { status: 200, description: 'The shop profile.', schema: shopProfileSchema },
      handle: () => repository.get(),
    }),
    defineRoute({
      method: 'put',
      path: '/shop',
      summary: 'Update the shop profile',
      description:
        'Administrators only. Bills already saved keep the details they were printed with.',
      access: 'admin',
      schemas: { body: shopProfileInputSchema },
      success: { status: 200, description: 'The saved shop profile.', schema: shopProfileSchema },
      errors: [400],
      handle: ({ body }) => repository.save(body),
    }),
    defineRoute({
      method: 'get',
      path: '/shop/logo',
      summary: 'Get the shop logo',
      description:
        "Printed at the top of bills and purchase orders. `logo` is '' when none is set.",
      schemas: {},
      success: { status: 200, description: 'The shop logo.', schema: shopLogoSchema },
      handle: async () => ({ logo: await repository.getLogo() }),
    }),
    defineRoute({
      method: 'put',
      path: '/shop/logo',
      summary: 'Upload or replace the shop logo',
      description: `Administrators only. A PNG, JPEG or WebP image as a base64 data URL, at most ${MAX_LOGO_BYTES / 1024} KB.`,
      access: 'admin',
      schemas: { body: shopLogoInputSchema },
      success: { status: 200, description: 'The saved logo.', schema: shopLogoSchema },
      errors: [400],
      handle: async ({ body }) => ({ logo: await repository.saveLogo(body.logo) }),
    }),
    defineRoute({
      method: 'delete',
      path: '/shop/logo',
      summary: 'Remove the shop logo',
      description: 'Administrators only. Bills and purchase orders then print without a logo.',
      access: 'admin',
      schemas: {},
      success: { status: 204, description: 'Logo removed.' },
      handle: async () => {
        await repository.saveLogo('');
      },
    }),
    defineRoute({
      method: 'get',
      path: '/shop/theme',
      summary: 'Get the app colour theme',
      description:
        "Public, so the sign-in page can show the shop's colours too. `color` is '' for the built-in theme.",
      access: 'public',
      schemas: {},
      success: { status: 200, description: 'The colour theme.', schema: shopThemeSchema },
      handle: async () => ({ color: await repository.getThemeColor() }),
    }),
    defineRoute({
      method: 'put',
      path: '/shop/theme',
      summary: 'Change the app colour theme',
      description:
        "Administrators only. One brand colour (usually taken from the logo) that the app builds its colours from; '' restores the built-in theme.",
      access: 'admin',
      schemas: { body: shopThemeInputSchema },
      success: { status: 200, description: 'The saved colour theme.', schema: shopThemeSchema },
      errors: [400],
      handle: async ({ body }) => ({ color: await repository.saveThemeColor(body.color) }),
    }),
  ],
};
