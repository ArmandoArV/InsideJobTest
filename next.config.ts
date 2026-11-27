import type { NextConfig } from "next";

/* Headers that do not vary per request. The CSP is set in proxy.ts instead,
   because it carries a per-request nonce. */
const SECURITY_HEADERS = [
  { key: "x-content-type-options", value: "nosniff" },
  { key: "referrer-policy", value: "strict-origin-when-cross-origin" },
  { key: "x-frame-options", value: "DENY" },
  { key: "strict-transport-security", value: "max-age=63072000; includeSubDomains; preload" },
  {
    key: "permissions-policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  { key: "cross-origin-opener-policy", value: "same-origin" },
  { key: "x-dns-prefetch-control", value: "off" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      {
        // Ledger reads must never be cached by a proxy: a stale integrity
        // indicator is worse than no indicator.
        source: "/api/:path*",
        headers: [
          ...SECURITY_HEADERS,
          { key: "cache-control", value: "no-store, no-cache, must-revalidate" },
          { key: "vary", value: "authorization" },
        ],
      },
    ];
  },
  /* config options here */
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
