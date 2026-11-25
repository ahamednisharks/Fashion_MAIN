-- =============================================================================
-- 010 — Colour theme of the app, usually taken from the shop logo.
--
--   * One brand colour on the single shop_settings row, as '#RRGGBB' (upper case);
--     '' = the built-in teal theme. The app builds every shade it needs (buttons, menu,
--     table headings…) from this one colour, so all counters show the same colours.
--   * Kept out of the profile that bills snapshot (sales_invoices.seller).
-- =============================================================================

ALTER TABLE shop_settings
  ADD COLUMN theme_color text NOT NULL DEFAULT ''
      CONSTRAINT shop_settings_theme_color_check CHECK (theme_color ~ '^(#[0-9A-F]{6})?$');
