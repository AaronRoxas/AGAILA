/** Backend performs DNS/IP validation before saving editorial URLs. */
export function articleSourceUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined;
    if (url.port && !['80', '443'].includes(url.port)) return undefined;
    if (!host.includes('.') || host.endsWith('.local') || host.endsWith('.localhost') ||
        /^(localhost|0\.|127\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}
