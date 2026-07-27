const CLOUDFLARE_ADVISOR_URL =
  'https://ai-shengyi-jing.pages.dev/api/advisor';
const MAX_BODY_BYTES = 16 * 1024;

class PayloadTooLargeError extends Error {}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

async function readBoundedBody(request) {
  const declaredLength = Number(request.headers.get('Content-Length') || 0);
  if (declaredLength > MAX_BODY_BYTES) {
    throw new PayloadTooLargeError('Request body is too large');
  }
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength > MAX_BODY_BYTES) {
    throw new PayloadTooLargeError('Request body is too large');
  }
  return body;
}

function signedPayload(timestamp, body) {
  const prefix = new TextEncoder().encode(`${timestamp}.`);
  const payload = new Uint8Array(prefix.length + body.length);
  payload.set(prefix);
  payload.set(body, prefix.length);
  return payload;
}

function bytesToHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function createSignature(secret, timestamp, body) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    signedPayload(timestamp, body)
  );
  return bytesToHex(new Uint8Array(signature));
}

async function onRequest(context) {
  const request = context.request;
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
  }

  const origin = request.headers.get('Origin');
  const requestOrigin = new URL(request.url).origin;
  if (origin && origin !== requestOrigin) {
    return jsonResponse({ error: 'REQUEST_ORIGIN_REJECTED' }, 403);
  }

  const secret = context.env?.EDGEONE_PROXY_SECRET;
  if (typeof secret !== 'string' || !secret) {
    return jsonResponse(
      { error: 'ADVISOR_PROXY_UNAVAILABLE', fallback: true },
      503
    );
  }

  let body;
  try {
    body = await readBoundedBody(request);
    JSON.parse(new TextDecoder().decode(body));
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return jsonResponse({ error: 'REQUEST_TOO_LARGE' }, 413);
    }
    return jsonResponse({ error: 'INVALID_JSON' }, 400);
  }

  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = await createSignature(secret, timestamp, body);
  const timeoutSignal =
    typeof AbortSignal !== 'undefined' &&
    typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(15_000)
      : undefined;

  try {
    const upstream = await fetch(CLOUDFLARE_ADVISOR_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AI-Shengyi-Jing-Timestamp': timestamp,
        'X-AI-Shengyi-Jing-Signature': signature
      },
      body,
      redirect: 'error',
      signal: timeoutSignal
    });

    const headers = new Headers({
      'Cache-Control': 'no-store',
      'Content-Type':
        upstream.headers.get('Content-Type') || 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff'
    });
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        message: 'Cloudflare advisor proxy failed',
        error: error instanceof Error ? error.message : String(error)
      })
    );
    return jsonResponse(
      { error: 'ADVISOR_PROXY_FAILED', fallback: true },
      503
    );
  }
}

export { createSignature, onRequest, signedPayload };
