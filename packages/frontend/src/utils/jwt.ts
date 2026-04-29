/**
 * Minimal JWT decoder (no verification — verification happens on the server).
 * Decodes the payload from a JWT string.
 */
export function jwtDecode(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }
  const payload = parts[1];
  // Base64url → Base64 → JSON
  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
  const json = atob(base64);
  return JSON.parse(json) as Record<string, unknown>;
}
