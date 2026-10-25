# Article images and hazard interface improvements

## Existing architecture and scope

The production worker in `backend/python/celery_worker.py` invokes
`pipeline/rss_processor_enhanced.py`: feedparser supplies source text,
the existing classifier and Geo-NER identify hazard categories and locations,
PostGIS validates locations, and deduplicated records are saved in `gaia.hazards`.
FastAPI's `api/hazards.py` proxies list/detail queries. React's `hazardsApi.ts`
maps responses for the Leaflet public map. Citizen attachments continue to use
their existing report join and `DamageReportSidebar`.

The legacy `rss_processor.py` is a diagnostic result-returning path, not the
production persistence path. It uses the shared image extractor inline, with
failure isolation. No classifiers, geocoding rules, triage rules or authentication
contracts were replaced.

## Implementation

New reports are saved before an optional task is sent to the existing Celery
worker. Image tasks have a 30/minute per-worker rate limit and 25/30-second
soft/hard task limits. Failed task dispatch leaves a recoverable, unattempted
row; it does not roll back ingestion. Tasks expire after one hour to avoid an
unbounded stale enrichment backlog. Existing worker deployment must be restarted
to register the new task. There is no automatic historical job.
Celery time limits require the production prefork pool; the home Compose solo
pool relies on the extractor's socket limits and cooperative budget instead.

`utils/article_images.py` tries Open Graph, Twitter cards, RSS media/enclosures,
article JSON-LD, then article/main-content images. It deduplicates URLs, resolves
relative paths and omits obvious decorative assets. Supported raster MIME types
are checked against file signatures and image dimensions (at least 120 pixels on
each side). Pillow reads headers only; pixels are never fully decoded or stored.
AVIF availability depends on the installed Pillow codecs. At most eight candidates
are tried. No new package or storage service is required.

Network safeguards:

- HTTP(S), no credentials, ports 80/443 only. Every resolved address must be public.
- Connect to a validated IP directly, preserving publisher Host, TLS SNI and
  certificate hostname verification. Redirects repeat URL, DNS and robots checks.
- Respect robots.txt, access errors, rate limits and crawl delays. Skip a publisher
  whose crawl delay exceeds the configured interval. No anti-bot or paywall bypass.
- One-second minimum interval per origin by default; no automatic request retries;
  up to three redirects, two-second connection and four-second socket limits,
  with a 20-second cooperative extraction budget. DNS resolution uses the OS
  resolver; its timeout is controlled by the container environment.
- Bounded HTML (1 MiB), robots (64 KiB) and image header (64 KiB) reads. Compression
  is not requested or decoded. Small images may fit entirely within that prefix.
- Source/robots/rate caches are limited to 256 entries; extraction/robots results
  expire after 15 minutes. Logs record outcomes without URL query strings or tokens.

The additive migration creates nullable `image_url`, `image_source_url`,
`image_alt`, `image_status`, `image_last_checked_at` and `source_headline` fields.
`source_headline` preserves incoming headline capitalization while the existing
normalized `source_title` continues serving deduplication. Old rows need no image
or status. Existing `source_published_at` and `validation_notes` are now exposed by
the API and preserved by the frontend mapper. Existing API cache TTLs apply to
image updates; the map refreshes its selected RSS report when data refreshes.

The detail panel uses a 16:9 lazy-loaded image with source attribution, alt text,
loading feedback and removal on failure. It distinguishes recorded severity,
classification confidence and workflow validation; confidence is never converted
to severity or real-world confirmation. Missing coordinates disable zoom.
Source publication and AGAILA recording timestamps use Philippine time.
The non-modal desktop panel and mobile bottom sheet leave map navigation available.
Close/Escape and focus restoration remain supported; hidden panels have no
focusable controls. Shared button styles and explicit text accompany status colors.
The light-theme secondary-text token was darkened to maintain at least 4.5:1
contrast on the existing background and card surfaces.

The landing page now leads with a live Leaflet preview and the eight newest
screened reports returned by the existing endpoint. The preview refreshes every
minute, has a type filter scoped to those eight records, selection shared between
markers and report buttons, and links into `/map?report=<id>`. It is a report sample,
not a completeness or safety claim. Empty/error states are explicit. Report links
survive map filter URL synchronization. Existing educational sections remain,
with language distinguishing screening from independent verification.

## Rollout

1. Apply `backend/supabase/migrations/20261025000001_article_images.sql` to the
   intended database through your normal migration process. Review the configured
   target first. The migration is additive and safe to apply again.
2. Deploy/restart the backend and existing Celery worker together, then deploy the
   frontend. Container networking continues using existing service names.
3. Check a new RSS report and worker logs. If migration or broker access is missing,
   the hazard still persists; optional enrichment logs a warning.
4. Review a small historical dry run before explicitly authorizing production writes.

No database migration or historical publisher fetch was run against your configured
production database during implementation. Only a disposable offline PostgreSQL
container was used to verify migration reruns and legacy-row preservation.

## Controlled historical backfill

Use the backend service with its existing environment configuration. From the
repository root (supply your usual Compose `--env-file`/`-f` arguments when needed):

```sh
docker compose run --rm --no-deps backend python -m backend.python.scripts.backfill_article_images --dry-run --batch-size 10 --max-batches 1 --interval 1
```

A dry run still contacts publishers but never writes reports. Review the summary
and the target database before explicitly enabling writes:

```sh
docker compose run --rm --no-deps backend python -m backend.python.scripts.backfill_article_images --apply --batch-size 25 --max-batches 1 --interval 1
```

Continue from the printed UUID cursor:

```sh
docker compose run --rm --no-deps backend python -m backend.python.scripts.backfill_article_images --apply --batch-size 25 --max-batches 4 --after-id UUID_FROM_PREVIOUS_SUMMARY
```

Default selection: RSS rows with a null/empty image URL and no prior check. Rows
without source URLs are recorded as missing; inaccessible sources as failed.
Selection is ordered by UUID with keyset pagination, not shifting offsets. Both
successful and unsuccessful attempts persist timestamps. Multiple rows for one
source reuse the extraction cache. Conditional writes preserve images saved by
another process. A persistence error stops before advancing past that row and
returns a nonzero CLI exit status; publisher failures do not stop the batch.

Rerunning without a cursor safely finds remaining unattempted rows (also catches
new UUIDs earlier than a prior cursor). Use `--retry-failed` to revisit checked
rows without images, including sources previously recorded as missing. This is
explicit and never overwrites an available image. Batch size is 1–200; maximum
batches is 1–1000; interval must be at least 0.5 seconds. Defaults are 25 rows,
one batch and one second. A worker's cache is process-local; concurrent workers
do not share a global publisher rate limit. Keep historical runs serial.

## Validation

Run checks inside the existing containers:

```sh
docker compose run --rm --no-deps backend python -m pytest tests/python/test_article_images.py tests/python/test_url_safety.py -q -o addopts=
docker compose run --rm --no-deps frontend npm test -- --watchAll=false --runInBand --runTestsByPath src/components/map/HazardInfoPanel.test.tsx src/services/articleImageMapping.test.ts src/components/landing/RecentHazards.test.tsx src/hooks/useHazardFilters.articleLink.test.tsx
docker compose run --rm --no-deps frontend npm run build
```

If using the default frontend source-only mounts, rebuild the frontend development
image when package/config files change. No package files were changed for this work;
pre-existing local package changes were preserved. Implementation checks used the
local Node 24 frontend image and Python backend image with current source mounted
read-only, no network, and no real database credentials.

The extraction/backfill tests cover metadata ordering, relative URLs, duplicate
sources, malformed content, blocked articles, broken primary images, spoofed MIME,
tracking pixels, missing sources, public/private DNS, pinned TLS connections,
redirect safety, body limits, robots rules, broker/DB failures, dry runs, resumes,
reruns and concurrent image writes. UI tests cover image load/failure/reset,
old reports, missing coordinates, long text, confidence/validation semantics,
keyboard close/focus, API mapping, type filtering, map/list selection, retry/empty
states and preservation of report links through filter changes.

The SQL fixture `tests/sql/test_article_images_migration.sql` creates its own
minimal `gaia.hazards`, applies the migration twice, and checks legacy rows/images.
Run it **only in a disposable empty database**, never against an application DB.

Executed results (2026-10-25):

- Focused Python extraction/backfill/API and existing URL-safety suite: 49 passed.
- React panel, source mapping, landing interactions and report-link tests: 18 passed.
- Existing marker suite, with accessible-label assertions and added severity coverage: 10 passed.
- New backend modules: flake8 passed; new frontend components/tests: ESLint passed.
- Production frontend build: passed with five existing lint warnings and stale Browserslist data.
- Migration rerun/legacy-image preservation: passed in disposable PostgreSQL 17.
- Five headless browser viewport scenarios: passed using temporary fixture reports.
- Whole-repository frontend lint: 14 existing errors, eight existing warnings in
  untouched tests/components and the pre-existing PublicMap search input.
- Standalone tsc: blocked by TypeScript 4.9 parsing newer react-hook-form/zod declarations.
- Additional config/audit integration check: failed at the pre-existing unsupported
  audit `status` argument before RSS processing. Focused suites above remain green.

## Limits and follow-up

Publisher hotlink restrictions, expiring URLs, HTTP mixed-content policies and
later source removals can still break display; the image disappears gracefully.
Unusually large headers, unsupported codecs or metadata-only logos can evade or
fail conservative image selection. The extractor fetches server-rendered HTML,
not JavaScript-only articles. A failed historical article fetch cannot recover
RSS media metadata that was never retained; it records the outcome for review.
Historical headlines fall back to stored normalized titles because the original
capitalization was not retained. No stock/generated replacement is displayed.

Headless Chrome viewport checks passed at 390×844, 768×1024 and 1440×1000 using
clearly labeled, temporary fixture reports: no horizontal overflow, visible close
and action controls, map/detail loading and Escape close. Landing rendering was
checked at mobile and desktop sizes. Map tiles were intentionally blocked during
these offline layout checks. Publisher image rendering and real touch navigation
should still be checked against your configured environment before release.
Standalone TypeScript and whole-repository lint currently expose
pre-existing dependency/test issues; see the implementation report for executed
results. The existing audit-config integration test also fails before reaching RSS
processing because `log_admin_action` receives an unsupported `status` argument.

Graphify/lean-ctx were unavailable in this session, and the referenced OpenSpec
directory/checklist were absent. Graph synchronization could not be run. Refresh
Graphify after these files and schema fields are adopted in the normal dev setup.

Network implementation follows the existing urllib3 dependency's
[connection-pool](https://urllib3.readthedocs.io/en/stable/reference/urllib3.connectionpool.html),
[custom TLS connection](https://urllib3.readthedocs.io/en/stable/advanced-usage.html#custom-sni-hostname),
and [bounded response read](https://urllib3.readthedocs.io/en/stable/reference/urllib3.response.html) APIs.
