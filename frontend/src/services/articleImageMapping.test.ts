import { mapApiResponseToHazard, HazardResponse } from './hazardsApi';
import { articleSourceUrl } from '../lib/articleSource';
jest.mock('../lib/api', () => ({ apiRequest: jest.fn() }));

test('image and source metadata survive API-to-map conversion', () => {
  const response: HazardResponse = {
    id: '1', hazard_type: 'flood', location_name: 'Manila', latitude: 14.6, longitude: 121,
    severity: null, confidence_score: 0.9, validated: true, source_type: 'rss',
    source_url: 'https://news.example/article', source_title: 'headline', source_content: 'excerpt',
    source_headline: 'Headline', source_published_at: '2026-10-25T00:00:00Z',
    validation_notes: 'Auto-validated', created_at: '2026-10-25T01:00:00Z', validated_at: null, validated_by: null,
    image_url: 'https://news.example/photo.jpg', image_alt: 'Flood waters', image_status: 'available',
    image_source_url: 'https://news.example/article', image_last_checked_at: '2026-10-25T01:00:00Z',
  };
  expect(mapApiResponseToHazard(response)).toMatchObject({
    image_url: response.image_url, image_alt: response.image_alt, image_status: 'available',
    source_headline: 'Headline', source_published_at: response.source_published_at,
    validation_notes: 'Auto-validated', severity: 'unknown',
  });
});

// eslint-disable-next-line no-script-url -- Intentional malicious-input fixture.
test.each(['javascript:alert(1)', 'data:image/png;base64,abc', 'http://127.0.0.1/a', 'http://10.0.0.1/a', 'http://[::1]/a', 'http://user:password@news.example/a', 'http://news.example:8000/a'])('blocks unsafe browser source URL %s', url => {
  expect(articleSourceUrl(url)).toBeUndefined();
});
