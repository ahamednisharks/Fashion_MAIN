import { z } from 'zod';

import {
  checkGstinMatchesState,
  emailField,
  gstinField,
  optionalMobileField,
  optionalText,
  pincodeField,
  requiredText,
  stateField,
} from '../../common/validators/fields.js';

/** Shop details printed on bills. */
export const shopProfileSchema = z
  .object({
    shopName: z.string(),
    phone: z.string(),
    email: z.string(),
    gstNumber: z.string().describe("Shop GSTIN, or ''."),
    address: z.string(),
    city: z.string(),
    state: z.string().describe('Decides CGST + SGST (same state) or IGST on bills.'),
    pincode: z.string(),
  })
  .meta({ id: 'ShopProfile' });
export type ShopProfile = z.infer<typeof shopProfileSchema>;

export const shopProfileInputSchema = z
  .object({
    shopName: requiredText('Shop name', 100),
    phone: optionalMobileField,
    email: emailField,
    gstNumber: gstinField,
    address: optionalText('Address', 250),
    city: optionalText('City', 60),
    state: stateField,
    pincode: pincodeField,
  })
  .superRefine(checkGstinMatchesState)
  .meta({ id: 'ShopProfileInput' });
export type ShopProfileInput = z.infer<typeof shopProfileInputSchema>;

/** Largest logo accepted, in bytes of image data (the app shrinks pictures well below this). */
export const MAX_LOGO_BYTES = 256 * 1024;

const LOGO_DATA_URL = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

/** First bytes of each accepted image format. */
const LOGO_SIGNATURES: Record<string, (bytes: Buffer) => boolean> = {
  png: (b) =>
    b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  jpeg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  webp: (b) =>
    b.subarray(0, 4).toString('latin1') === 'RIFF' &&
    b.subarray(8, 12).toString('latin1') === 'WEBP',
};

/** Shop logo as an image data URL; '' when the shop has none. */
export const shopLogoSchema = z
  .object({
    logo: z.string().describe("data:image/(png|jpeg|webp);base64,… or '' (no logo)."),
  })
  .meta({ id: 'ShopLogo' });
export type ShopLogo = z.infer<typeof shopLogoSchema>;

export const shopLogoInputSchema = z
  .object({
    logo: z
      .string({ error: 'Logo is required.' })
      .trim()
      .superRefine((value, ctx) => {
        const match = LOGO_DATA_URL.exec(value);
        if (!match) {
          ctx.addIssue({
            code: 'custom',
            message: 'Logo must be a PNG, JPEG or WebP image (base64 data URL).',
          });
          return;
        }
        const [, format, base64] = match as unknown as [string, string, string];
        const bytes = Buffer.from(base64, 'base64');
        if (bytes.length > MAX_LOGO_BYTES) {
          ctx.addIssue({
            code: 'custom',
            message: `Logo can be at most ${MAX_LOGO_BYTES / 1024} KB.`,
          });
        } else if (!LOGO_SIGNATURES[format]?.(bytes)) {
          ctx.addIssue({
            code: 'custom',
            message: `Logo is not a valid ${format.toUpperCase()} image.`,
          });
        }
      })
      .describe(
        `data:image/(png|jpeg|webp);base64,… — at most ${MAX_LOGO_BYTES / 1024} KB of image data.`,
      ),
  })
  .meta({ id: 'ShopLogoInput' });
export type ShopLogoInput = z.infer<typeof shopLogoInputSchema>;

/** App colour theme: one brand colour the app builds its palette from; '' = built-in teal. */
export const shopThemeSchema = z
  .object({
    color: z.string().describe("Brand colour as '#RRGGBB', or '' for the built-in theme."),
  })
  .meta({ id: 'ShopTheme' });
export type ShopTheme = z.infer<typeof shopThemeSchema>;

export const shopThemeInputSchema = z
  .object({
    color: z
      .string({ error: 'Colour is required.' })
      .trim()
      .regex(/^(#?[0-9a-fA-F]{6})?$/, 'Colour must be a HEX code such as #1F2A5A.')
      .transform((value) => (value ? `#${value.replace('#', '').toUpperCase()}` : ''))
      .describe("'#RRGGBB' (any case, '#' optional), or '' for the built-in theme."),
  })
  .meta({ id: 'ShopThemeInput' });
export type ShopThemeInput = z.infer<typeof shopThemeInputSchema>;
