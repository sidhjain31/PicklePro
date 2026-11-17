import { apiBase } from './event.js';

// /auth/* is shared by both events; everything else goes to this page's event (/api or /api/kids).
export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`${path.startsWith('/auth/') ? '/api' : apiBase()}${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body && JSON.stringify(body),
    });
  } catch {
    throw new Error("Can't reach the server. Check the connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data.error ?? (res.status >= 500 ? "Can't reach the server. Check the connection and try again." : `Request failed (${res.status})`);
    throw Object.assign(new Error(message), { status: res.status, data });
  }
  return data;
}
