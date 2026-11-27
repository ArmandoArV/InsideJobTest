/* Asserts the deployed CSP is actually strict and actually complete.
   Runs against BASE_URL; used in CI and before a release. */
const BASE = process.env.BASE_URL ?? "http://localhost:3100";

const REQUIRED_HEADERS: Array<[string, RegExp]> = [
  ["content-security-policy", /default-src 'self'/],
  ["content-security-policy", /frame-ancestors 'none'/],
  ["content-security-policy", /object-src 'none'/],
  ["x-content-type-options", /^nosniff$/],
  ["referrer-policy", /strict-origin/],
  ["strict-transport-security", /max-age=\d{7,}/],
  ["permissions-policy", /geolocation=\(\)/],
];

async function main() {
  const res = await fetch(`${BASE}/agents`);
  const html = await res.text();
  let failed = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
    if (!ok) failed++;
  };

  console.log(`\nCSP verification against ${BASE}\n`);

  for (const [header, pattern] of REQUIRED_HEADERS) {
    const value = res.headers.get(header) ?? "";
    check(`${header} matches ${pattern}`, pattern.test(value), value ? "" : "(header absent)");
  }

  const csp = res.headers.get("content-security-policy") ?? "";
  check("no unsafe-inline anywhere", !csp.includes("unsafe-inline"), csp.slice(0, 60));
  check("no unsafe-eval in production",
        process.env.NODE_ENV === "development" || !csp.includes("unsafe-eval"));
  check("a per-request nonce is present", /'nonce-[A-Za-z0-9+/=]{20,}'/.test(csp));

  // Every inline script must be covered: nonced, or the one pinned React hash.
  const inline = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
    .filter(([, , body]) => body.trim().length > 0);
  const uncovered = inline.filter(([, attrs, body]) =>
    !attrs.includes("nonce=") &&
    body.trim() !== "requestAnimationFrame(function(){$RT=performance.now()});");
  check(`every inline script is nonced or pinned (${inline.length} inline)`,
        uncovered.length === 0,
        uncovered.map((u) => u[2].trim().slice(0, 60)).join(" | "));

  check("no inline style attributes in the markup", !/<[^>]+\sstyle="/.test(html));

  console.log("");
  if (failed) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
export {};
