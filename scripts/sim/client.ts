/** HTTP client for the simulation. Talks to the public API exactly as an
 *  external agent does, records latency, and backs off on rate limits. */
export class Client {
  readonly latencies: number[] = [];
  private calls = 0;
  constructor(private base: string) {}

  get callCount() { return this.calls; }

  async call(
    path: string,
    opts: { method?: string; token?: string; body?: unknown; idem?: string } = {},
  ): Promise<{ status: number; body: any }> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (opts.token) headers.authorization = `Bearer ${opts.token}`;
      if (opts.idem) headers["idempotency-key"] = opts.idem;

      const started = Date.now();
      const res = await fetch(`${this.base}${path}`, {
        method: opts.method ?? "GET",
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
      const text = await res.text();
      this.latencies.push(Date.now() - started);
      this.calls++;

      let body: any = null;
      try { body = text ? JSON.parse(text) : null; } catch { body = text; }

      // A 429 is the system working, not an error: wait out the window.
      if (res.status === 429 && attempt < 3) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      return { status: res.status, body };
    }
    return { status: 429, body: null };
  }

  p95(): number {
    if (!this.latencies.length) return 0;
    const sorted = [...this.latencies].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.95)];
  }
}
