// Utility to compute the base URL for client-side API and route calls
// Rule:
// - If current host matches *.bih.id, use process.env.NEXT_PUBLIC_APP_URL
// - Else, use window.location.origin + '/dicom-viewer'
// Notes:
// - Always strip trailing slashes
// - Guard against SSR (no window)

export function getBaseUrl() {
  const stripTrailing = (s) => (s || '').replace(/\/+$/, '');

  const envBase = stripTrailing(process.env.NEXT_PUBLIC_APP_URL || '');

  if (typeof window !== 'undefined') {
    try {
      const { origin, host } = window.location || {};
      const isBihHost = !!host && (host === 'bih.id' || host.endsWith('.bih.id'));
      if (isBihHost) {
        // Prefer the env-configured public base on BIH domains
        if (envBase) return envBase;
        // Fallback if env not set
        return stripTrailing(`${origin}/dicom-viewer`);
      }
      // Non-BIH hosts (localhost, custom paths, etc.)
      return stripTrailing(`${origin}/dicom-viewer`);
    } catch (_) {
      // Last resort on any unexpected runtime error
      return envBase;
    }
  }

  // SSR fallback: we cannot inspect window; use env if available
  return envBase;
}
