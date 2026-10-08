export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
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
    throw Object.assign(new Error(message), { status: res.status });
  }
  return data;
}
