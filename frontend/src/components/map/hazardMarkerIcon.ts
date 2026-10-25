/**
 * Custom Hazard Marker Icon Creator for Leaflet
 *
 * Creates map markers with:
 * - FontAwesome SVG icons embedded for each hazard type
 * - Color-coded backgrounds matching hazard type
 * - Severity-based outer rings with a neutral style for unassessed reports
 * - Optimized caching with size-based eviction
 *
 * Module: GV-02 (Map Markers)
 * Implementation: Icon Refactor - SVG replacement for text initials
 */

import L, { DivIcon } from 'leaflet';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { getHazardIcon } from '../../constants/hazard-icons';

// HTML escape helper to prevent XSS injection via ariaLabel
const escapeHtml = (text: string): string => {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
};

// Configuration for marker caching and eviction
const MAX_ENTRIES = 200; // Cache up to 200 icons (12 hazard types × 3 severities = 36 combinations)
const markerCache = new Map<string, DivIcon>();

/**
 * Converts a FontAwesome IconDefinition to SVG string
 * Handles proper scaling and white fill for marker display
 */
function iconToSvgString(iconDef: IconDefinition, size: number = 14): string {
  try {
    // FontAwesome icon structure: { prefix, iconName, icon: [width, height, ligatures, unicode, svgPathData] }
    if (!iconDef?.icon?.[4]) {
      return getDefaultIconSvg(size);
    }

    const [width, height, , , svgPathData] = iconDef.icon;
    const viewBox = `0 0 ${width} ${height}`;

    // Handle both string and array SVG path formats
    const pathElement = Array.isArray(svgPathData)
      ? `<path d="${svgPathData[0]}" fill="white"/>${
          svgPathData.length > 1 ? `<path d="${svgPathData[1]}" fill="white"/>` : ''
        }`
      : `<path d="${svgPathData}" fill="white"/>`;

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${size}" height="${size}" style="display:block; filter: drop-shadow(0 0 2px rgba(0,0,0,0.3))">
      ${pathElement}
    </svg>`;
  } catch {
    return getDefaultIconSvg(size);
  }
}

/**
 * Fallback SVG when icon conversion fails (simple exclamation mark)
 */
function getDefaultIconSvg(size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" style="display:block;">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="white"/>
  </svg>`;
}

/**
 * Evicts oldest entries from cache when limit reached
 * Uses a simple strategy: remove 10% of entries (20 icons) when full
 */
function evictCacheIfNeeded(): void {
  if (markerCache.size >= MAX_ENTRIES) {
    const toEvict = Math.ceil(MAX_ENTRIES * 0.1); // Remove 10%
    let evicted = 0;
    for (const key of markerCache.keys()) {
      if (evicted >= toEvict) break;
      markerCache.delete(key);
      evicted++;
    }
  }
}

/**
 * Creates a hazard marker icon with FontAwesome SVG and severity ring
 *
 * @param hazardType - Type of hazard (e.g., 'flood', 'typhoon')
 * @param severity - Recorded severity; absent values remain unassessed
 * @returns Leaflet DivIcon ready for marker placement
 */
export function getHazardMarkerIcon(
  hazardType: string,
  severity?: string
): DivIcon {
  const normalizedType = (hazardType || 'other').toLowerCase();
  const normalizedSeverity = (severity || 'unknown').toLowerCase();
  const cacheKey = `${normalizedType}:${normalizedSeverity}`;

  // Return cached icon if available
  if (markerCache.has(cacheKey)) {
    return markerCache.get(cacheKey)!;
  }

  // Get hazard configuration (includes icon definition)
  const config = getHazardIcon(normalizedType);

  // Calculate severity ring styling
  const severityRing =
    normalizedSeverity === 'critical'
      ? '0 0 0 3px rgba(220,38,38,0.35)' // Red ring for critical
      : ['high', 'severe'].includes(normalizedSeverity)
        ? '0 0 0 3px rgba(234,88,12,0.5)'
        : ['moderate', 'medium'].includes(normalizedSeverity)
          ? '0 0 0 3px rgba(217,119,6,0.5)'
          : ['minor', 'low'].includes(normalizedSeverity)
            ? '0 0 0 2px rgba(13,148,136,0.5)'
            : '0 0 0 2px rgba(15,23,42,0.25)';
  const severityLabel = ['critical', 'high', 'severe', 'moderate', 'medium', 'minor', 'low']
    .includes(normalizedSeverity) ? normalizedSeverity : 'not assessed';

  // Convert FontAwesome icon to SVG
  const iconSvg = iconToSvgString(config.icon, 14);

  // Create the marker HTML: circular background with embedded SVG icon
  const icon = L.divIcon({
    className: 'hazard-marker-icon',
    html: `<div style="
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: ${config.color};
      border: 2px solid #ffffff;
      box-shadow: ${severityRing};
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      overflow: hidden;
    " title="${escapeHtml(config.ariaLabel)} · Severity: ${severityLabel}">
      ${iconSvg}
    </div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

  // Cache the icon and evict old entries if needed
  evictCacheIfNeeded();
  markerCache.set(cacheKey, icon);

  return icon;
}

/**
 * Clears the marker icon cache (useful for testing or memory pressure)
 */
export function clearMarkerIconCache(): void {
  markerCache.clear();
}

/**
 * Returns current cache statistics (for debugging/performance monitoring)
 */
export function getMarkerIconCacheStats(): {
  size: number;
  maxSize: number;
  entries: string[];
} {
  return {
    size: markerCache.size,
    maxSize: MAX_ENTRIES,
    entries: Array.from(markerCache.keys()),
  };
}
