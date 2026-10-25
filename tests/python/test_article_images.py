"""Offline extraction, network-boundary and persistence regression tests."""
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import Mock
import socket
import time

import pytest
from PIL import Image

from backend.python.utils import article_images as images
from backend.python.scripts.backfill_article_images import backfill

ARTICLE = 'https://news.example/story'
PHOTO = 'https://news.example/editorial.jpg'
_jpeg_fixture = BytesIO()
Image.new('RGB', (640, 360)).save(_jpeg_fixture, format='JPEG')
JPEG = _jpeg_fixture.getvalue()


def extractor(monkeypatch, html='', entry_status=200, image_status=200, mime='image/jpeg'):
    instance = images.ArticleImageExtractor()
    fetch = Mock(side_effect=lambda url, *a, **k: (
        (entry_status, {'Content-Type': 'text/html'}, html.encode(), ARTICLE)
        if url == ARTICLE else (image_status, {'Content-Type': mime}, JPEG, url)
    ))
    monkeypatch.setattr(instance, '_fetch', fetch)
    return instance, fetch


def test_priority_relative_urls_dedup_and_decorative_filter():
    html = '''<meta property="og:image" content="/editorial.jpg#fragment">
    <meta name="twitter:image" content="/twitter.png">
    <script type="application/ld+json">{"@graph":[{"@type":"NewsArticle","image":{"url":"/schema.jpg"}}]}</script>
    <article><img src="/logo.png"><img src="/tiny.jpg" width="1"><img src="/content.jpg" alt="Flood waters"></article>'''
    entry = {'media_content': [{'url': PHOTO}, {'url': '/rss.jpg', 'type': 'image/jpeg'}]}
    candidates = list(images.image_candidates(html, entry, ARTICLE))
    assert [u for u, _ in candidates] == [PHOTO, 'https://news.example/twitter.png',
        'https://news.example/rss.jpg', 'https://news.example/schema.jpg', 'https://news.example/content.jpg']
    assert candidates[-1][1] == 'Flood waters'


def test_og_image_and_duplicate_article_cache(monkeypatch):
    instance, fetch = extractor(monkeypatch, '<meta property="og:image" content="/editorial.jpg">')
    first = instance.extract(ARTICLE, title='Flood report')
    assert first.image_url == PHOTO and first.image_status == 'available'
    assert first.image_source_url == ARTICLE and first.image_alt == 'Flood report'
    assert instance.extract(ARTICLE) == first
    assert fetch.call_count == 2


def test_editorial_alt_metadata_is_preserved_with_malformed_rss():
    html = '<meta property="og:image" content="/editorial.jpg"><meta property="og:image:alt" content="Residents evacuating">'
    assert list(images.image_candidates(html, {'media_content': [{'url': PHOTO, 'type': {}}]}, ARTICLE))[0] == (
        PHOTO, 'Residents evacuating')


def test_api_contract_accepts_legacy_rows_and_serializes_image_metadata():
    from backend.python.api.hazards import HazardResponse
    legacy = dict(id='id', hazard_type='heat_index', location_name='Olongapo', latitude=14.8,
                  longitude=120.3, confidence_score=1, validated=True, source_type='rss',
                  created_at='2026-10-25T00:00:00Z')
    assert HazardResponse(**legacy).image_url is None
    response = HazardResponse(**legacy, image_url=PHOTO, image_status='available',
                              source_headline='Heat report', source_published_at='2026-10-24T00:00:00Z')
    assert response.model_dump()['image_url'] == PHOTO
    assert response.model_dump()['source_headline'] == 'Heat report'


@pytest.mark.parametrize('entry', [
    {'media_content': [{'url': PHOTO}]}, {'media_thumbnail': [{'url': PHOTO}]},
    {'enclosures': [{'href': PHOTO, 'type': 'image/jpeg'}]},
])
def test_rss_media_even_when_article_blocks_fetch(monkeypatch, entry):
    instance, _ = extractor(monkeypatch, entry_status=403)
    assert instance.extract(ARTICLE, entry).image_url == PHOTO


def test_broken_primary_falls_back(monkeypatch):
    instance, fetch = extractor(monkeypatch)
    fetch.side_effect = [
        (200, {'Content-Type': 'text/html'}, b'<meta property="og:image" content="/bad.jpg"><meta name="twitter:image" content="/good.jpg">', ARTICLE),
        (404, {'Content-Type': 'text/html'}, b'not found', ''),
        (200, {'Content-Type': 'image/jpeg'}, JPEG, PHOTO),
    ]
    assert instance.extract(ARTICLE).image_url == PHOTO


@pytest.mark.parametrize('html,status,mime,expected', [
    ('<article><p>No image</p>', 200, 'image/jpeg', 'missing'),
    ('<script type="application/ld+json">{bad</script><article><img', 200, 'image/jpeg', 'missing'),
    ('<meta property="og:image" content="/bad.jpg">', 200, 'text/html', 'failed'),
    ('', 403, 'image/jpeg', 'failed'),
    ('<meta property="og:image" content="/bad.jpg">', 404, 'image/jpeg', 'failed'),
])
def test_missing_malformed_blocked_and_broken(monkeypatch, html, status, mime, expected):
    instance, _ = extractor(monkeypatch, html, entry_status=status, mime=mime)
    assert instance.extract(ARTICLE).image_status == expected


def test_rejects_spoofed_mime(monkeypatch):
    instance, fetch = extractor(monkeypatch)
    fetch.side_effect = [(200, {'Content-Type': 'text/html'}, b'<meta property="og:image" content="/bad.jpg">', ARTICLE),
                         (200, {'Content-Type': 'image/jpeg'}, b'<html>bad', PHOTO)]
    assert instance.extract(ARTICLE).image_url is None


def test_rejects_tracking_pixel_dimensions(monkeypatch):
    instance, fetch = extractor(monkeypatch)
    pixel = BytesIO()
    Image.new('RGB', (1, 1)).save(pixel, format='JPEG')
    fetch.side_effect = [(200, {'Content-Type': 'text/html'}, b'<meta property="og:image" content="/hidden.jpg">', ARTICLE),
                         (200, {'Content-Type': 'image/jpeg'}, pixel.getvalue(), PHOTO)]
    assert instance.extract(ARTICLE).image_url is None


def test_enqueue_uses_existing_worker_and_broker_failure_is_optional(monkeypatch):
    import sys
    task = Mock()
    monkeypatch.setitem(sys.modules, 'backend.python.celery_worker', SimpleNamespace(enrich_article_image_task=task))
    images.queue_article_image('id', ARTICLE, {'media_thumbnail': [{'url': PHOTO, 'unexpected': object()}]}, 'Headline')
    assert task.apply_async.call_args.kwargs['retry'] is False
    assert task.apply_async.call_args.kwargs['args'][2] == {'media_content': [], 'media_thumbnail': [{'url': PHOTO}], 'enclosures': [], 'links': []}
    task.apply_async.side_effect = RuntimeError('broker down')
    images.queue_article_image('id', ARTICLE, {}, 'Headline')


@pytest.mark.parametrize('url', ['file:///etc/passwd', 'http://u:p@news.example/a',
    'http://news.example:8000/a', 'http://127.0.0.1/a', 'http://169.254.169.254/a',
    'http://10.0.0.1/a', 'http://[::1]/a', 'http://news.example/a\nheader'])
def test_rejects_unsafe_targets(monkeypatch, url):
    def resolve(host, port, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, '', (host if host != 'news.example' else '8.8.8.8', port))]
    monkeypatch.setattr(images.socket, 'getaddrinfo', resolve)
    with pytest.raises(ValueError):
        images.public_target(url)


def test_rejects_mixed_public_private_dns(monkeypatch):
    monkeypatch.setattr(images.socket, 'getaddrinfo', lambda *a, **k: [
        (2, 1, 6, '', ('8.8.8.8', 443)), (2, 1, 6, '', ('10.0.0.1', 443))])
    with pytest.raises(ValueError):
        images.public_target(ARTICLE)


def test_connection_is_pinned_and_redirect_revalidated(monkeypatch):
    monkeypatch.setattr(images.socket, 'getaddrinfo', lambda host, port, **k: [
        (2, 1, 6, '', ('127.0.0.1' if host == 'internal.example' else '8.8.8.8', port))])
    response = SimpleNamespace(status=302, headers={'Location': 'http://internal.example/secret'}, close=Mock())
    pool = Mock()
    pool.urlopen.return_value = response
    constructor = Mock(return_value=pool)
    monkeypatch.setattr(images.urllib3, 'HTTPSConnectionPool', constructor)
    with pytest.raises(ValueError):
        images.ArticleImageExtractor()._fetch(ARTICLE, 32, time.monotonic() + 10)
    assert constructor.call_args.args == ('8.8.8.8', 443)
    assert constructor.call_args.kwargs['server_hostname'] == 'news.example'
    assert constructor.call_args.kwargs['assert_hostname'] == 'news.example'
    assert pool.urlopen.call_args.kwargs['redirect'] is False
    assert pool.urlopen.call_args.kwargs['retries'] is False
    response.close.assert_called_once()


def test_body_read_is_bounded(monkeypatch):
    monkeypatch.setattr(images, 'public_target', lambda u: (images.urlsplit(u), '8.8.8.8', 443))
    response = Mock(status=200, headers={'Content-Type': 'image/jpeg'})
    stream = BytesIO(JPEG + b'x' * 10000)
    response.read1.side_effect = lambda count, **kwargs: stream.read(count)
    pool = Mock()
    pool.urlopen.return_value = response
    monkeypatch.setattr(images.urllib3, 'HTTPSConnectionPool', lambda *a, **k: pool)
    _, _, body, _ = images.ArticleImageExtractor()._fetch(PHOTO, 32, time.monotonic() + 10)
    assert len(body) == 33 and stream.tell() == 33


def test_robots_denial_and_slow_publisher(monkeypatch):
    instance = images.ArticleImageExtractor()
    fetch = Mock(return_value=(200, {}, b'User-agent: *\nDisallow: /story', ''))
    monkeypatch.setattr(instance, '_fetch', fetch)
    assert not instance._allowed(ARTICLE, time.monotonic() + 10)
    assert not instance._allowed(ARTICLE, time.monotonic() + 10)
    assert fetch.call_count == 1
    instance.robots.clear()
    fetch.return_value = (200, {}, b'User-agent: *\nCrawl-delay: 10', '')
    assert not instance._allowed(ARTICLE, time.monotonic() + 10)


@pytest.mark.asyncio
async def test_optional_enrichment_never_raises_on_db_error():
    client = Mock()
    client.schema.side_effect = RuntimeError('migration not applied')
    instance = Mock()
    instance.extract.return_value = images.ArticleImage()
    await images.enrich_saved_hazard(client, 'id', ARTICLE, extractor=instance)


class MemoryClient:
    """Tiny query fake enforcing the same conditional persistence predicates."""
    def __init__(self, rows):
        self.rows = rows
        self.writes = 0
        self.fail_id = None
        self.race_id = None

    def schema(self, name):
        return self

    def from_(self, name):
        return MemoryQuery(self)


class MemoryQuery:
    def __init__(self, client):
        self.client, self.predicates, self.payload, self.size = client, [], None, 1000

    def select(self, *args): return self
    def order(self, *args): return self
    def limit(self, size): self.size = size; return self
    def eq(self, key, value): self.predicates.append(lambda r: r.get(key) == value); return self
    def gt(self, key, value): self.predicates.append(lambda r: r[key] > value); return self
    def is_(self, key, value): self.predicates.append(lambda r: r.get(key) is None); return self
    def or_(self, *args): self.predicates.append(lambda r: not r.get('image_url')); return self
    def update(self, payload): self.payload = payload; return self

    def execute(self):
        if self.payload and self.client.race_id:
            for row in self.client.rows:
                if row['id'] == self.client.race_id:
                    row['image_url'] = 'https://news.example/already-saved.jpg'
        rows = [r for r in self.client.rows if all(p(r) for p in self.predicates)][:self.size]
        if self.payload:
            for row in rows:
                if row['id'] == self.client.fail_id:
                    raise RuntimeError('database down')
                row.update(self.payload)
                self.client.writes += 1
        return SimpleNamespace(data=rows)


def rows():
    return [dict(id=f'00000000-0000-0000-0000-{i:012}', source_type='rss',
                 source_url=ARTICLE if i != 2 else None) for i in range(1, 5)]


def test_backfill_dry_run_idempotency_resumption_and_missing_url(monkeypatch):
    client = MemoryClient(rows())
    client.rows[3]['image_url'] = PHOTO
    instance, fetch = extractor(monkeypatch, '<meta property="og:image" content="/editorial.jpg">')
    preview = backfill(client, batch_size=2, extractor=instance)
    assert preview['scanned'] == 2 and client.writes == 0
    first = backfill(client, batch_size=2, apply=True, extractor=instance)
    assert first['available'] == 1 and first['missing'] == 1
    rest = backfill(client, after_id=first['after_id'], apply=True, extractor=instance)
    assert rest['updated'] == 1 and client.writes == 3
    assert backfill(client, apply=True, extractor=instance)['scanned'] == 0
    assert fetch.call_count == 2  # Shared source only fetched once across rows.


def test_backfill_failure_does_not_advance_cursor_and_can_retry(monkeypatch):
    client = MemoryClient(rows())
    client.fail_id = client.rows[1]['id']
    instance, _ = extractor(monkeypatch)
    first = backfill(client, apply=True, extractor=instance)
    assert first['errors'] == 1 and first['after_id'] == client.rows[0]['id']
    client.fail_id = None
    assert backfill(client, after_id=first['after_id'], apply=True, extractor=instance)['scanned'] == 3
    assert backfill(client, apply=True, retry_failed=True, extractor=instance)['scanned'] == 4


def test_backfill_preserves_concurrently_saved_images(monkeypatch):
    client = MemoryClient(rows()[:1])
    client.race_id = client.rows[0]['id']
    instance, _ = extractor(monkeypatch)
    summary = backfill(client, apply=True, extractor=instance)
    assert summary['updated'] == 0
    assert client.rows[0]['image_url'].endswith('/already-saved.jpg')
