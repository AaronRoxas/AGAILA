/**
 * Landing Page Asset Paths
 * 
 * Central registry for all landing page assets.
 * Assets should be placed in /public/assets/landing/
 * 
 * Note: Replace placeholder paths with actual Figma exports
 */

export const landingAssets = {
  // Hero Section
  hero: {
    background: '/assets/img/background.webp',
    gridBackground: '/assets/img/Grid-Plane.png',
    heatmapOverlay: '/assets/img/bg-heatmap-overlay.png',
    pinVolcano: '/assets/img/Pin-volcanic_eruption.svg',
    pinFlood: '/assets/img/Pin-flood.svg',
    pinEarthquake: '/assets/img/Pin-earthquake.svg',
    pinLandslide: '/assets/img/Pin-landslide.svg',
    // Image Showcase
    showcaseImage: '/assets/img/showcase-public-map.webp',
    realTimeFiltering: '/assets/img/real-time-filtering.webp',
    hazardDensityMap: '/assets/img/hazard-density-map.webp',
    aiClassification: '/assets/img/ai-classification-report-feed.webp',
  },
  
  // Features Section
  features: {
    aiClassification: '/assets/img/feature-ai-classification.png',
    geoNer: '/assets/img/feature-geo-ner.png',
    commandDashboard: '/assets/img/feature-command-dashboard.png',
  },
  
  // Product Showcase Section  
  showcase: {
    liveMap: '/assets/img/bg-heatmap.png',
    reportFeed: '/assets/img/bg-heatmap.png',
    heatmap: '/assets/img/bg-heatmap.png',
    filtering: '/assets/img/bg-heatmap.png',
  },
  
  // Logos
  logo: {
    gaia: '/assets/img/AGAILA.svg',
  },
  logos: {
    gaia: '/assets/img/AGAILA.svg',
    lpuc: '/assets/img/lpu-c_logo.png',
    astars: '/assets/img/A-stars-logo.svg',
  },
  
  // Icons
  icons: {
    arrowRight: '/assets/img/arrow-right.svg',
  },
} as const;

export type LandingAssets = typeof landingAssets;
