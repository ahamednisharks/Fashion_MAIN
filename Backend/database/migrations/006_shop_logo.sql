-- =============================================================================
-- 006 — Shop logo, printed at the top of bills and purchase orders.
--
--   * Stored on the single shop_settings row as an image data URL ('' = no logo). The app
--     shrinks the picture before uploading, so it stays small (at most 256 KB of image data).
--   * Kept out of the profile that bills snapshot (sales_invoices.seller), so saved bills do
--     not each carry a copy; reprinted bills show the current logo.
-- =============================================================================

ALTER TABLE shop_settings
  ADD COLUMN logo text NOT NULL DEFAULT ''
      CONSTRAINT shop_settings_logo_check
      CHECK (logo = '' OR (octet_length(logo) <= 360000
                           AND logo ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$'));
