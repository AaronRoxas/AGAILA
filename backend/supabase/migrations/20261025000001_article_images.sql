-- Additive, compatible with legacy hazards and citizen-report attachments.
BEGIN;
ALTER TABLE gaia.hazards
    ADD COLUMN IF NOT EXISTS source_headline text,
    ADD COLUMN IF NOT EXISTS image_url text,
    ADD COLUMN IF NOT EXISTS image_source_url text,
    ADD COLUMN IF NOT EXISTS image_alt text,
    ADD COLUMN IF NOT EXISTS image_status text,
    ADD COLUMN IF NOT EXISTS image_last_checked_at timestamptz;

COMMENT ON COLUMN gaia.hazards.image_url IS 'Validated public editorial image URL; never a generated substitute.';
COMMENT ON COLUMN gaia.hazards.image_status IS 'Optional enrichment outcome: available, missing, failed; NULL means not attempted.';

CREATE INDEX IF NOT EXISTS idx_hazards_article_images_pending
    ON gaia.hazards (id)
    WHERE source_type = 'rss' AND (image_url IS NULL OR image_url = '');
COMMIT;
