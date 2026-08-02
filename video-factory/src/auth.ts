const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const normalizeActivationCode = (value: string) => value.replace(/[\s-]+/g, '').toUpperCase();

function toBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function toHex(bytes: Uint8Array) {
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function sha256Hex(value: string) {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}

export async function verifyAdminKey(provided: string, expected: string) {
  if (!provided || !expected) return false;
  const [left, right] = await Promise.all([crypto.subtle.digest('SHA-256', encoder.encode(provided)), crypto.subtle.digest('SHA-256', encoder.encode(expected))]);
  const a = new Uint8Array(left), b = new Uint8Array(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  return difference === 0;
}

export async function issueDeviceSession(secret: string, now = Date.now(), lifetimeSeconds = 30 * 24 * 60 * 60) {
  const issuedAt = Math.floor(now / 1000);
  const payload = { v: 1, sub: 'production-device', iat: issuedAt, exp: issuedAt + lifetimeSeconds, jti: crypto.randomUUID() };
  const encodedPayload = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(encodedPayload)));
  return { token: `${encodedPayload}.${toBase64Url(signature)}`, expiresAt: new Date(payload.exp * 1000).toISOString() };
}

export async function verifyDeviceSession(token: string, secret: string, now = Date.now()) {
  if (!token || !secret) return false;
  const [encodedPayload, encodedSignature, extra] = token.split('.');
  if (!encodedPayload || !encodedSignature || extra) return false;
  try {
    const signature = fromBase64Url(encodedSignature);
    const validSignature = await crypto.subtle.verify('HMAC', await hmacKey(secret), signature, encoder.encode(encodedPayload));
    if (!validSignature) return false;
    const payload = JSON.parse(decoder.decode(fromBase64Url(encodedPayload)));
    const currentTime = Math.floor(now / 1000);
    return payload?.v === 1 && payload?.sub === 'production-device' && Number.isInteger(payload.iat) && Number.isInteger(payload.exp) && payload.iat <= currentTime + 60 && payload.exp > currentTime;
  } catch {
    return false;
  }
}
