import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-request nonce and Content-Security-Policy.
 *
 * SD-5 claims a strict policy, so this is a strict policy: no `unsafe-inline`
 * anywhere, including for style attributes. That constraint is why the agent
 * mark's per-agent tone is a class rather than an inline style, and why the
 * root error screen uses a stylesheet instead of inline styles. Weakening the
 * policy to fit the code would have been the easier direction and the wrong one.
 *
 * `strict-dynamic` lets Next's nonced bootstrap load the chunks it needs
 * without us enumerating them.
 */
/**
 * React's streaming SSR emits one inline script with no nonce:
 *   requestAnimationFrame(function(){$RT=performance.now()});
 * It only timestamps Suspense reveals, so blocking it is harmless — but a
 * console violation on every page load buries the ones that matter. Pinned by
 * hash, verified against the shipped bytes. A React upgrade that changes this
 * string will surface as a fresh violation rather than failing silently, and
 * `npm run verify:csp` asserts it.
 */
const REACT_STREAM_TIMING_HASH = "'sha256-7mu4H06fwDCjmnxxr/xNHyuQC6pLTHr4M2E4jXw5WZs='";

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";

  const csp = [
    `default-src 'self'`,
    /* 'self' plus a nonce, deliberately without 'strict-dynamic'.
       strict-dynamic would be stronger, but it makes 'self' inert and Next
       does not put the nonce on every chunk <script> it emits under Turbopack
       — half of them come back un-nonced and the page simply does not load.
       A policy that breaks the application is not a policy, so this keeps the
       property that matters (no unsafe-inline; inline script runs only with
       the per-request nonce) and accepts that any same-origin script URL is
       allowed. We serve no user-supplied content from this origin, so reaching
       that requires already controlling the build output.
       React uses eval in development for better error stacks; never in production. */
    `script-src 'self' 'nonce-${nonce}' ${REACT_STREAM_TIMING_HASH}${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    `img-src 'self' blob: data:`,
    `font-src 'self'`,
    // Same-origin only: the page talks to this API and nothing else.
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: [
    /* Everything except static assets and the favicon; prefetches carry their
       own nonce so they are matched too. */
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [{ type: "header", key: "next-router-prefetch" }],
    },
  ],
};
