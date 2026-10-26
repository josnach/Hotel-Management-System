const BASE = '/api';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const tokenStore = {
  get: () => localStorage.getItem('hms_token'),
  set: (t: string) => localStorage.setItem('hms_token', t),
  clear: () => localStorage.removeItem('hms_token'),
};

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  params?: Record<string, unknown>,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const qs = params
    ? '?' +
      new URLSearchParams(
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== '' && v !== null)
          .map(([k, v]) => [k, String(v)]),
      ).toString()
    : '';

  const res = await fetch(`${BASE}${path}${qs}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(tokenStore.get()
        ? { Authorization: `Bearer ${tokenStore.get()}` }
        : {}),
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

 if (res.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/auth/2fa/verify')) {
    tokenStore.clear();
    window.location.href = '/login';
  }

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(res.status, data.message ?? 'Request failed');
  }

  return data as T;
}

/** Fetch a file (e.g. a PDF) with the auth header and return it as a Blob. */
async function blob(path: string): Promise<Blob> {
  const res = await fetch(`${BASE}${path}`, { headers: tokenStore.get() ? { Authorization: `Bearer ${tokenStore.get()}` } : {} });
  if (res.status === 401) { tokenStore.clear(); window.location.href = '/login'; }
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new ApiError(res.status, d.message ?? 'Download failed'); }
  return res.blob();
}

/** Open a protected PDF in a new tab, or save it. */
export async function openPdf(path: string, filename?: string) {
  const b = await blob(path);
  const url = URL.createObjectURL(b);
  if (filename) { const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); }
  else window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const api = {
  get: <T = any>(p: string, params?: Record<string, unknown>) =>
    request<T>('GET', p, undefined, params),

  post: <T = any>(
    p: string,
    b?: unknown,
    headers?: Record<string, string>,
  ) => request<T>('POST', p, b ?? {}, undefined, headers),

  put: <T = any>(p: string, b?: unknown) =>
    request<T>('PUT', p, b),

  patch: <T = any>(p: string, b?: unknown) =>
    request<T>('PATCH', p, b),

  del: <T = any>(p: string) =>
    request<T>('DELETE', p),
};
