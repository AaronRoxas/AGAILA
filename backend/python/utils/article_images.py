"""Bounded editorial-image discovery. No image bytes are persisted or proxied.

Connections are pinned to a checked public IP (including redirect targets), while
TLS SNI/certificate verification and the HTTP Host header retain the publisher name.
"""
from collections import OrderedDict
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from io import BytesIO
import ipaddress
import json
import logging
import re
import socket
import ssl
import time
from urllib.parse import urljoin, urlsplit, urlunsplit
from urllib.robotparser import RobotFileParser

from bs4 import BeautifulSoup
from PIL import Image
import urllib3

logger = logging.getLogger(__name__)
USER_AGENT = "AGAILA-ArticleImages/1.0"
IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"}
DECORATIVE = re.compile(r"(?:logo|favicon|avatar|advert|tracking|pixel|sprite|social[-_]?icon)", re.I)


@dataclass(frozen=True)
class ArticleImage:
    image_url: str | None = None
    image_source_url: str | None = None
    image_alt: str | None = None
    image_status: str = "missing"
    image_last_checked_at: str | None = None

    def fields(self):
        return asdict(self)


def queue_article_image(hazard_id, article_url, entry, title):
    """Reuse Celery for optional work, keeping publisher I/O out of ingestion."""
    try:
        from backend.python.celery_worker import enrich_article_image_task
        metadata = {}
        for key in ('media_content', 'media_thumbnail', 'enclosures', 'links'):
            values = entry.get(key, [])
            if isinstance(values, list):
                metadata[key] = [{k: str(v)[:2048] for k, v in item.items()
                                  if k in ('url', 'href', 'type', 'title', 'rel') and isinstance(v, str)}
                                 for item in values[:20] if isinstance(item, dict)]
        enrich_article_image_task.apply_async(
            args=[hazard_id, article_url, metadata, title[:1000]], retry=False,
            expires=3600, ignore_result=True,
        )
    except Exception:
        # Backfill can recover these unattempted rows when the broker is restored.
        logger.warning("Optional article image task could not be queued")


def public_target(url):
    """Reject credentials, odd ports, non-public/mixed DNS and unsafe schemes."""
    if not isinstance(url, str) or len(url) > 2048 or any(ord(c) < 33 for c in url):
        raise ValueError("Invalid URL")
    parsed = urlsplit(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Unsafe URL")
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    if port not in (80, 443):
        raise ValueError("Unsafe port")
    addresses = socket.getaddrinfo(parsed.hostname, port, type=socket.SOCK_STREAM)
    if not addresses:
        raise ValueError("Unresolved host")
    for address in addresses:
        ip = ipaddress.ip_address(address[4][0])
        if not ip.is_global or ip.is_multicast:
            raise ValueError("Non-public address")
    return parsed, addresses[0][4][0], port


def image_candidates(html, entry, article_url):
    """Yield ordered (URL, alt) candidates without issuing network requests."""
    soup = BeautifulSoup(html or "", "html.parser")
    candidates = []
    for key in ("og:image", "twitter:image", "twitter:image:src"):
        alt_key = 'og:image:alt' if key == 'og:image' else 'twitter:image:alt'
        alt_tag = soup.find('meta', attrs={'property': alt_key}) or soup.find('meta', attrs={'name': alt_key})
        for tag in soup.find_all("meta"):
            if str(tag.get("property") or tag.get("name") or "").lower() == key:
                candidates.append((tag.get("content"), alt_tag.get('content', '') if alt_tag else ''))
    entry = entry if isinstance(entry, dict) else {}
    for key in ("media_content", "media_thumbnail", "enclosures", "links"):
        items = entry.get(key, [])
        if not isinstance(items, list):
            continue
        for item in items[:20]:
            if not isinstance(item, dict):
                continue
            if key == "links" and item.get("rel") != "enclosure":
                continue
            kind = item.get("type", "")
            if kind and (not isinstance(kind, str) or not kind.startswith("image/")):
                continue
            candidates.append((item.get("url") or item.get("href"), item.get("title", "")))

    def images(value):
        if isinstance(value, str):
            candidates.append((value, ""))
        elif isinstance(value, list):
            for item in value[:20]:
                images(item)
        elif isinstance(value, dict):
            candidates.append((value.get("url") or value.get("contentUrl"), value.get("caption", "")))

    def articles(value, depth=0):
        if depth > 12:
            return
        if isinstance(value, list):
            for item in value[:30]:
                articles(item, depth + 1)
        elif isinstance(value, dict):
            types = value.get("@type", [])
            types = [types] if isinstance(types, str) else types
            if isinstance(types, list) and any(str(t).lower().endswith("article") for t in types):
                images(value.get("image"))
            if "@graph" in value:
                articles(value["@graph"], depth + 1)

    for script in soup.find_all("script", type="application/ld+json")[:20]:
        try:
            articles(json.loads(script.string or script.get_text()))
        except (ValueError, TypeError, RecursionError):
            continue
    for img in soup.select("article img, main img")[:30]:
        try:
            if any(float(img.get(dim, 1000)) < 120 for dim in ("width", "height")):
                continue
        except (ValueError, TypeError):
            pass
        candidates.append((img.get("src") or img.get("data-src"), img.get("alt", "")))
    seen = set()
    for raw, alt in candidates:
        if not isinstance(raw, str) or not raw.strip():
            continue
        try:
            url = urljoin(article_url, raw.strip())
            parts = urlsplit(url)
            url = urlunsplit(parts._replace(fragment=""))
            if parts.scheme not in ("http", "https") or DECORATIVE.search(parts.path):
                continue
            suffix = parts.path.rsplit("/", 1)[-1].rsplit(".", 1)[-1].lower()
            if suffix in ("svg", "ico", "pdf", "mp4", "html"):
                continue
            if url not in seen:
                seen.add(url)
                yield url, BeautifulSoup(str(alt), "html.parser").get_text()[:300]
        except ValueError:
            continue


class ArticleImageExtractor:
    """Use one instance per serial feed/backfill batch; caches are bounded."""

    def __init__(self, interval=1.0, budget=20.0):
        self.interval = max(0.5, interval)
        self.budget = budget
        self.results = OrderedDict()
        self.robots = OrderedDict()
        self.last_request = OrderedDict()

    def _fetch(self, url, limit, deadline, respect_robots=False):
        for _ in range(4):
            if respect_robots and not self._allowed(url, deadline):
                raise ValueError("Publisher access restricted")
            parsed, address, port = public_target(url)
            origin = (parsed.scheme, parsed.netloc)
            wait = self.interval - (time.monotonic() - self.last_request.get(origin, 0))
            if time.monotonic() + max(0, wait) >= deadline:
                raise TimeoutError("Image extraction budget exceeded")
            if wait > 0:
                time.sleep(wait)
            self.last_request[origin] = time.monotonic()
            if len(self.last_request) > 256:
                self.last_request.popitem(last=False)
            pool_class = urllib3.HTTPSConnectionPool if parsed.scheme == "https" else urllib3.HTTPConnectionPool
            tls = dict(server_hostname=parsed.hostname, assert_hostname=parsed.hostname,
                       ssl_context=ssl.create_default_context()) if parsed.scheme == "https" else {}
            pool = pool_class(address, port, **tls)
            response = None
            try:
                timeout = min(4.0, max(0.1, deadline - time.monotonic()))
                response = pool.urlopen(
                    "GET", urlunsplit(("", "", parsed.path or "/", parsed.query, "")),
                    headers={"Host": parsed.netloc, "User-Agent": USER_AGENT, "Accept-Encoding": "identity"},
                    redirect=False, retries=False, preload_content=False,
                    timeout=urllib3.Timeout(total=timeout, connect=min(2.0, timeout), read=timeout),
                )
                if response.status in (301, 302, 303, 307, 308):
                    url = urljoin(url, response.headers.get("Location", ""))
                    continue
                status, headers = response.status, response.headers
                body = bytearray()
                while len(body) <= limit:
                    if time.monotonic() >= deadline:
                        raise TimeoutError("Image extraction budget exceeded")
                    # read1 returns after one underlying read, allowing budget checks
                    # even when a server trickles a response a few bytes at a time.
                    chunk = response.read1(min(16384, limit + 1 - len(body)), decode_content=False)
                    if not chunk:
                        break
                    body.extend(chunk)
                return status, headers, bytes(body), url
            finally:
                if response is not None:
                    response.close()
                pool.close()
        raise ValueError("Too many redirects")

    def _allowed(self, url, deadline):
        parts = urlsplit(url)
        origin = f"{parts.scheme}://{parts.netloc}"
        cached = self.robots.get(origin)
        if cached and time.monotonic() - cached[0] < 900:
            policy = cached[1]
        else:
            status, _, body, _ = self._fetch(origin + "/robots.txt", 65536, deadline)
            policy = RobotFileParser()
            if status == 404:
                policy.parse([])
            elif status == 200 and len(body) <= 65536:
                policy.parse(body.decode("utf-8", errors="replace").splitlines())
            else:
                return False  # Fail closed on restrictions, rate limits and server errors.
            self.robots[origin] = (time.monotonic(), policy)
            if len(self.robots) > 256:
                self.robots.popitem(last=False)
        delay = policy.crawl_delay(USER_AGENT) or 0
        if delay > self.interval:
            # Respect slow publishers by skipping this optional enrichment.
            return False
        return policy.can_fetch(USER_AGENT, url)

    def extract(self, article_url, entry=None, title=""):
        checked = datetime.now(timezone.utc).isoformat()
        empty = ArticleImage(image_last_checked_at=checked)
        if not article_url:
            return empty
        if not isinstance(article_url, str) or len(article_url) > 2048:
            return ArticleImage(image_status="failed", image_last_checked_at=checked)
        cached = self.results.get(article_url)
        if cached and time.monotonic() - cached[0] < 900:
            return cached[1]
        deadline = time.monotonic() + self.budget
        failed = False
        try:
            status, headers, html, final_url = self._fetch(article_url, 1024 * 1024, deadline, respect_robots=True)
            if status != 200 or "text/html" not in headers.get("Content-Type", "").lower() or len(html) > 1024 * 1024:
                raise ValueError("Article unavailable")
        except Exception:
            # Feed media can still be usable when a publisher blocks its article.
            failed, html, final_url = True, b"", article_url
        result = None
        try:
            for index, (candidate, alt) in enumerate(image_candidates(html, entry, final_url)):
                if index >= 8 or time.monotonic() >= deadline:
                    break
                try:
                    # Read only a bounded header prefix, never decode full-resolution pixels.
                    status, headers, prefix, final_image = self._fetch(candidate, 65536, deadline, respect_robots=True)
                    mime = headers.get("Content-Type", "").split(";", 1)[0].lower().strip()
                    signatures = {
                        "image/jpeg": prefix.startswith(b"\xff\xd8\xff"),
                        "image/png": prefix.startswith(b"\x89PNG\r\n\x1a\n"),
                        "image/gif": prefix.startswith((b"GIF87a", b"GIF89a")),
                        "image/webp": prefix.startswith(b"RIFF") and prefix[8:12] == b"WEBP",
                        "image/avif": prefix[4:8] == b"ftyp" and b"avif" in prefix[8:32],
                    }
                    if (status in (200, 206) and mime in IMAGE_TYPES and signatures.get(mime)
                            and self._editorial_dimensions(prefix)):
                        result = ArticleImage(final_image, article_url, alt or title[:300] or None,
                                              "available", checked)
                        break
                    failed = True
                except Exception:
                    failed = True
            if result is None:
                result = ArticleImage(image_status="failed" if failed else "missing", image_last_checked_at=checked)
        except Exception:
            result = ArticleImage(image_status="failed", image_last_checked_at=checked)
        self.results[article_url] = (time.monotonic(), result)
        if len(self.results) > 256:
            self.results.popitem(last=False)
        logger.info("Article image extraction status=%s", result.image_status)
        return result

    @staticmethod
    def _editorial_dimensions(prefix):
        try:
            with Image.open(BytesIO(prefix)) as image:
                width, height = image.size
                return min(width, height) >= 120 and width * height <= 100_000_000
        except Exception:
            return False


async def enrich_saved_hazard(client, hazard_id, article_url, entry=None, title="", extractor=None):
    """Optional post-insert enrichment: image/DB failures never drop a hazard."""
    import asyncio
    extractor = extractor or ArticleImageExtractor()
    try:
        result = await asyncio.to_thread(extractor.extract, article_url, entry, title)
        fields = result.fields()
        if title:
            fields['source_headline'] = title[:1000]
        await asyncio.to_thread(lambda: client.schema("gaia").from_("hazards")
                                .update(fields).eq("id", hazard_id)
                                .or_("image_url.is.null,image_url.eq.\"\"").execute())
    except Exception:
        logger.warning("Optional article image enrichment could not be saved")
