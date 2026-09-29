export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`/api${path}`, {
      cache: "no-store",
      credentials: "same-origin",
      ...rest,
      headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
    if (res.status === 503 && attempt < 2) {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      continue;
    }
    if (!res.ok) {
      let msg = res.statusText;
      try {
        const d = (await res.json()).detail ?? msg;
        // FastAPI validation errors -> first readable message
        msg = Array.isArray(d) ? d.map((x: { msg?: string }) => (x.msg ?? "").replace(/^Value error, /, "")).join("; ") : d;
      } catch {}
      throw new ApiError(res.status, typeof msg === "string" ? msg : JSON.stringify(msg));
    }
    return res.json() as Promise<T>;
  }
  throw new ApiError(503, "Service busy");
}

export const store = {
  get(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch {} },
  del(k: string) { try { localStorage.removeItem(k); } catch {} },
};
