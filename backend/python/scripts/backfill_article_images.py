"""Controlled article-image backfill; dry-run by default, no scheduler hookup."""
import argparse
import logging
from uuid import UUID

from backend.python.utils.article_images import ArticleImageExtractor

logger = logging.getLogger(__name__)


def backfill(client, *, batch_size=25, max_batches=1, after_id=None,
             apply=False, retry_failed=False, extractor=None):
    if not 1 <= batch_size <= 200 or not 1 <= max_batches <= 1000:
        raise ValueError("batch_size must be 1..200; max_batches must be 1..1000")
    if after_id:
        UUID(after_id)
    extractor = extractor or ArticleImageExtractor()
    summary = dict(scanned=0, available=0, missing=0, failed=0, updated=0, errors=0,
                   after_id=after_id, dry_run=not apply)
    for _ in range(max_batches):
        query = (client.schema("gaia").from_("hazards")
                 .select("id,source_url,source_title")
                 .eq("source_type", "rss").or_('image_url.is.null,image_url.eq.""'))
        if not retry_failed:
            query = query.is_("image_last_checked_at", "null")
        if summary["after_id"]:
            query = query.gt("id", summary["after_id"])
        rows = query.order("id").limit(batch_size).execute().data or []
        if not rows:
            break
        for row in rows:
            try:
                result = extractor.extract(row.get("source_url"), title=row.get("source_title") or "")
            except Exception:
                # Custom extractor failures are isolated just like network failures.
                from backend.python.utils.article_images import ArticleImage
                from datetime import datetime, timezone
                result = ArticleImage(image_status="failed",
                                      image_last_checked_at=datetime.now(timezone.utc).isoformat())
            summary["scanned"] += 1
            summary[result.image_status] += 1
            if apply:
                try:
                    update = (client.schema("gaia").from_("hazards").update(result.fields())
                              .eq("id", row["id"]).or_('image_url.is.null,image_url.eq.""'))
                    if not retry_failed:
                        update = update.is_("image_last_checked_at", "null")
                    saved = update.execute()
                    summary["updated"] += len(saved.data or [])
                except Exception:
                    # Do not advance the cursor past an unpersisted row.
                    summary["errors"] += 1
                    logger.error("Backfill persistence failed; resume from after_id=%s", summary["after_id"])
                    return summary
            summary["after_id"] = row["id"]
        logger.info("Article image backfill progress: %s", summary)
        if len(rows) < batch_size:
            break
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true", help="Write outcomes to the configured database")
    mode.add_argument("--dry-run", action="store_true", help="Inspect/extract only (default; still fetches publishers)")
    parser.add_argument("--batch-size", type=int, default=25)
    parser.add_argument("--max-batches", type=int, default=1)
    parser.add_argument("--after-id", type=str)
    parser.add_argument("--retry-failed", action="store_true", help="Include previously checked missing/failed rows")
    parser.add_argument("--interval", type=float, default=1, help="Minimum seconds between requests to each origin")
    args = parser.parse_args()
    if args.interval < 0.5:
        parser.error("--interval must be at least 0.5 seconds")
    if not 1 <= args.batch_size <= 200 or not 1 <= args.max_batches <= 1000:
        parser.error("--batch-size must be 1..200 and --max-batches 1..1000")
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    from backend.python.lib.supabase_client import supabase
    if supabase is None:
        parser.error("Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the backend container")
    summary = backfill(supabase, batch_size=args.batch_size, max_batches=args.max_batches,
                       after_id=args.after_id, apply=args.apply, retry_failed=args.retry_failed,
                       extractor=ArticleImageExtractor(interval=args.interval))
    print(summary)
    return 1 if summary["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
