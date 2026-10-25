/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getHazardMarkerIcon, clearMarkerIconCache, getMarkerIconCacheStats } from './hazardMarkerIcon';

describe('getHazardMarkerIcon', () => {
  beforeEach(() => {
    clearMarkerIconCache();
  });

  afterEach(() => {
    clearMarkerIconCache();
  });

  it('creates a marker icon with SVG for flood hazard', () => {
    const icon = getHazardMarkerIcon('flood', 'low');
    expect(icon.options.html).toContain('<svg');
    expect(icon.options.html).toContain('Flood'); // Accessible hazard label, not SVG implementation text.
    expect(icon.options.className).toBe('hazard-marker-icon');
    expect(icon.options.iconSize).toEqual([24, 24]);
  });

  it('creates marker icons for all hazard types', () => {
    const hazardTypes = ['flood', 'typhoon', 'landslide', 'earthquake', 'volcanic_eruption', 
                        'storm_surge', 'tsunami', 'fire', 'drought', 'heat_wave', 'heavy_rain', 'other'];
    
    hazardTypes.forEach(type => {
      const icon = getHazardMarkerIcon(type, 'low');
      expect(icon.options.html).toContain('<svg');
      expect(icon.options.iconSize).toEqual([24, 24]);
      expect(icon.options.iconAnchor).toEqual([12, 12]);
    });
  });

  it('applies different severity rings', () => {
    const critical = getHazardMarkerIcon('flood', 'critical');
    const high = getHazardMarkerIcon('flood', 'high');
    const low = getHazardMarkerIcon('flood', 'low');

    // Verify that HTML is defined and different for each severity
    expect(critical.options.html).toBeDefined();
    expect(high.options.html).toBeDefined();
    expect(low.options.html).toBeDefined();
    
    expect(critical.options.html).not.toEqual('');
    expect(high.options.html).not.toEqual('');
    expect(low.options.html).not.toEqual('');
    
    // Verify distinct rendering across severity levels
    expect(critical.options.html).not.toEqual(high.options.html);
    expect(high.options.html).not.toEqual(low.options.html);
    expect(critical.options.html).not.toEqual(low.options.html);
  });

  it('returns cached icon for same hazard/severity combination', () => {
    const a = getHazardMarkerIcon('flood', 'high');
    const b = getHazardMarkerIcon('flood', 'high');
    expect(a).toBe(b); // Same object reference from cache
  });

  it('creates different icons for different severity levels', () => {
    const high = getHazardMarkerIcon('flood', 'high');
    const low = getHazardMarkerIcon('flood', 'low');
    expect(high).not.toBe(low);
  });

  it('normalizes hazard type case', () => {
    const upper = getHazardMarkerIcon('FLOOD', 'low');
    const lower = getHazardMarkerIcon('flood', 'low');
    expect(upper).toBe(lower);
  });

  it('falls back to "other" for unknown hazard types', () => {
    const icon = getHazardMarkerIcon('unknown_hazard', 'low');
    expect(icon.options.html).toContain('<svg');
    expect(icon.options.html).toContain('Other hazard indicator');
  });

  it('keeps missing severity distinct from low and describes recorded severity', () => {
    const unknown = getHazardMarkerIcon('flood');
    const low = getHazardMarkerIcon('flood', 'low');
    const severe = getHazardMarkerIcon('flood', 'severe');
    const moderate = getHazardMarkerIcon('flood', 'moderate');
    expect(unknown.options.html).toContain('Severity: not assessed');
    expect(low.options.html).toContain('Severity: low');
    expect(unknown.options.html).not.toEqual(low.options.html);
    expect(severe.options.html).toContain('Severity: severe');
    expect(moderate.options.html).toContain('Severity: moderate');
    expect(severe.options.html).not.toEqual(moderate.options.html);
  });

  it('tracks cache statistics correctly', () => {
    expect(getMarkerIconCacheStats().size).toBe(0);
    
    getHazardMarkerIcon('flood', 'low');
    expect(getMarkerIconCacheStats().size).toBe(1);
    
    getHazardMarkerIcon('typhoon', 'high');
    expect(getMarkerIconCacheStats().size).toBe(2);
    
    // Same key should not increase cache size
    getHazardMarkerIcon('flood', 'low');
    expect(getMarkerIconCacheStats().size).toBe(2);
  });

  it('evicts cache entries when limit is exceeded', () => {
    const stats = getMarkerIconCacheStats();
    const maxSize = stats.maxSize; // Should be 200
    
    // Fill cache with unique synthetic keys to trigger eviction
    // Using synthetic hazard types and severities to generate many unique keys
    for (let i = 0; i < maxSize + 20; i++) {
      const syntheticType = `synthetic_hazard_${i}`;
      const severity = ['low', 'high', 'critical'][i % 3];
      getHazardMarkerIcon(syntheticType, severity);
    }
    
    const after = getMarkerIconCacheStats().size;
    expect(after).toBeLessThanOrEqual(maxSize);
  });
});
