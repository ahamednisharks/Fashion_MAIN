import { type Queryable, pool } from '../../config/database.js';
import type { ShopProfile, ShopProfileInput } from './shop-settings.schema.js';

const COLUMNS = `
  shop_name AS "shopName", phone, email, gst_number AS "gstNumber",
  address, city, state, pincode`;

const EMPTY_PROFILE: ShopProfile = {
  shopName: '',
  phone: '',
  email: '',
  gstNumber: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
};

/** The single shop_settings row (id = 1, created by migration 003). */
export class ShopSettingsRepository {
  constructor(private readonly db: Queryable = pool) {}

  async get(db: Queryable = this.db): Promise<ShopProfile> {
    const result = await db.query<ShopProfile>(`SELECT ${COLUMNS} FROM shop_settings WHERE id = 1`);
    return result.rows[0] ?? { ...EMPTY_PROFILE };
  }

  async save(input: ShopProfileInput): Promise<ShopProfile> {
    const result = await this.db.query<ShopProfile>(
      `INSERT INTO shop_settings (id, shop_name, phone, email, gst_number, address, city, state, pincode)
       VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE
          SET shop_name = EXCLUDED.shop_name, phone = EXCLUDED.phone, email = EXCLUDED.email,
              gst_number = EXCLUDED.gst_number, address = EXCLUDED.address, city = EXCLUDED.city,
              state = EXCLUDED.state, pincode = EXCLUDED.pincode
       RETURNING ${COLUMNS}`,
      [
        input.shopName,
        input.phone,
        input.email,
        input.gstNumber,
        input.address,
        input.city,
        input.state,
        input.pincode,
      ],
    );
    return result.rows[0];
  }

  /** The logo data URL, or '' when none is set. */
  async getLogo(): Promise<string> {
    const result = await this.db.query<{ logo: string }>(
      'SELECT logo FROM shop_settings WHERE id = 1',
    );
    return result.rows[0]?.logo ?? '';
  }

  /** Replaces the logo ('' removes it). */
  async saveLogo(logo: string): Promise<string> {
    const result = await this.db.query<{ logo: string }>(
      `INSERT INTO shop_settings (id, logo) VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET logo = EXCLUDED.logo
       RETURNING logo`,
      [logo],
    );
    return result.rows[0]?.logo ?? '';
  }

  /** The theme colour ('#RRGGBB'), or '' for the built-in theme. */
  async getThemeColor(): Promise<string> {
    const result = await this.db.query<{ color: string }>(
      'SELECT theme_color AS color FROM shop_settings WHERE id = 1',
    );
    return result.rows[0]?.color ?? '';
  }

  /** Replaces the theme colour ('' = built-in theme). */
  async saveThemeColor(color: string): Promise<string> {
    const result = await this.db.query<{ color: string }>(
      `INSERT INTO shop_settings (id, theme_color) VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET theme_color = EXCLUDED.theme_color
       RETURNING theme_color AS color`,
      [color],
    );
    return result.rows[0]?.color ?? '';
  }
}
