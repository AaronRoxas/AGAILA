\set ON_ERROR_STOP on
-- Execute only in a disposable database (see the guide).
CREATE SCHEMA gaia;
CREATE TABLE gaia.hazards (id uuid PRIMARY KEY, source_type text, source_title text);
INSERT INTO gaia.hazards VALUES
 ('00000000-0000-0000-0000-000000000001', 'rss', 'existing article'),
 ('00000000-0000-0000-0000-000000000002', 'citizen_report', 'existing citizen report');
\ir ../../backend/supabase/migrations/20261025000001_article_images.sql
UPDATE gaia.hazards SET image_url = 'https://news.example/photo.jpg', image_status = 'available'
 WHERE source_type = 'rss';
\ir ../../backend/supabase/migrations/20261025000001_article_images.sql
DO $$
BEGIN
 IF (SELECT count(*) FROM gaia.hazards) != 2 THEN RAISE EXCEPTION 'Legacy rows lost'; END IF;
 IF (SELECT image_url FROM gaia.hazards WHERE source_type = 'rss') != 'https://news.example/photo.jpg'
 THEN RAISE EXCEPTION 'Existing image overwritten'; END IF;
 IF (SELECT image_status FROM gaia.hazards WHERE source_type = 'citizen_report') IS NOT NULL
 THEN RAISE EXCEPTION 'Citizen report changed'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_hazards_article_images_pending')
 THEN RAISE EXCEPTION 'Backfill index missing'; END IF;
END $$;
