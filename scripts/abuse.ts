/* ============================================================================
 * Adversarial suite. One case per threat in SPEC.md section 9, each asserting
 * the attack FAILS. These are regression tests for security properties, which
 * is how the properties stay true after an agent edits a file.
 *
 * Runs against the real HTTP API with real credentials — the same surface the
 * attacking agents get. Nothing here reaches past the API.
 * ========================================================================== */

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

let passed = 0, failed = 0;
const failures: string[] = [];

function check(threat: string, name: string, condition: boolean, detail = "") {
  if (condition) { passed++; console.log(`  PASS  ${threat}  ${name}`); }
  else {
    failed++; failures.push(`${threat} ${name} ${detail}`);
    console.log(`  FAIL  ${threat}  ${name}  ${detail}`);
  }
}

type Res = { status: number; body: any };
async function call(
  path: string,
  opts: { method?: string; token?: string; body?: unknown; idem?: string } = {},
): Promise<Res> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.idem) headers["idempotency-key"] = opts.idem;
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body };
}

const uniq = () => Math.random().toString(36).slice(2, 12);

async function register(handle: string) {
  const r = await call("/api/agents/register", {
    method: "POST",
    body: { handle, ownerName: `owner-${handle}` },
  });
  if (r.status !== 200) throw new Error(`register failed: ${r.status} ${JSON.stringify(r.body)}`);
  return { id: r.body.agent.id as string, token: r.body.apiKey as string };
}

async function main() {
  console.log(`\nAdversarial suite against ${BASE}\n`);

  const seller = await register(`seller-${uniq()}`);
  const buyer = await register(`buyer-${uniq()}`);
  const outsider = await register(`outsider-${uniq()}`);

  // ---- baseline: a legitimate trade, so the attacks have something real ----
  const listing = await call("/api/listings", {
    method: "POST", token: seller.token,
    body: { title: "Apple iPhone 13 Pro 256 GB", description: "Battery 89%",
            condition: "Like new", askMinor: 4_120_000 },
  });
  check("—", "seller can list", listing.status === 200, JSON.stringify(listing.body));
  const listingId = listing.body?.id;

  const offer = await call(`/api/listings/${listingId}/offers`, {
    method: "POST", token: buyer.token,
    body: { amountMinor: 3_800_000, message: "Would you take this?" },
  });
  check("—", "buyer can offer", offer.status === 200, JSON.stringify(offer.body));
  const offerId = offer.body?.id;

  // ---------------------------------------------------------------- T2 ----
  const peek = await call(`/api/offers/${offerId}`, { token: outsider.token });
  check("T2", "outsider cannot read a private offer", peek.status === 404,
        `got ${peek.status}`);

  const peekList = await call(`/api/listings/${listingId}/offers`, { token: outsider.token });
  check("T2", "outsider sees no offers on someone else's listing",
        peekList.status === 200 && (peekList.body?.offers?.length ?? 0) === 0,
        JSON.stringify(peekList.body));

  const sellerSees = await call(`/api/offers/${offerId}`, { token: seller.token });
  check("T2", "the listing's seller CAN read the offer", sellerSees.status === 200);

  // ---------------------------------------------------------------- T8 ----
  const impostor = await register("seller-impostor");
  const impostorPeek = await call(`/api/offers/${offerId}`, { token: impostor.token });
  check("T8", "handle collision grants nothing", impostorPeek.status === 404,
        `got ${impostorPeek.status}`);

  // --------------------------------------------------------------- T16 ----
  const noAuth = await call("/api/me");
  const badPrefix = await call("/api/me", { token: "ab_zzzzzzzz.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" });
  const badSecret = await call("/api/me", {
    token: `${buyer.token.split(".")[0]}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`,
  });
  check("T16", "no credential is 401", noAuth.status === 401);
  // requestId is a random per-request handle and is expected to differ; it
  // carries no information about why the call failed. Everything else must match.
  const stripId = (b: any) => JSON.stringify({ ...b?.error, requestId: undefined });
  check("T16", "unknown prefix and wrong secret are indistinguishable",
        badPrefix.status === badSecret.status &&
        stripId(badPrefix.body) === stripId(badSecret.body),
        `${badPrefix.status}/${stripId(badPrefix.body)} vs ${badSecret.status}/${stripId(badSecret.body)}`);

  // ---------------------------------------------------------------- T5 ----
  const accepted = await call(`/api/offers/${offerId}/accept`, {
    method: "POST", token: seller.token, idem: `acc-${uniq()}`,
  });
  check("—", "seller accepts the offer", accepted.status === 200, JSON.stringify(accepted.body));
  const tradeId = accepted.body?.id;

  const buyerAcceptsOwn = await call(`/api/offers/${offerId}/accept`, {
    method: "POST", token: buyer.token, idem: `acc-${uniq()}`,
  });
  check("T5", "buyer cannot accept their own bid",
        buyerAcceptsOwn.status === 404 || buyerAcceptsOwn.status === 409,
        `got ${buyerAcceptsOwn.status}`);

  // ---------------------------------------------------------------- T4 ----
  const racers = await Promise.all([
    call(`/api/trades/${tradeId}/fund`, { method: "POST", token: buyer.token, idem: `f1-${uniq()}` }),
    call(`/api/trades/${tradeId}/fund`, { method: "POST", token: buyer.token, idem: `f2-${uniq()}` }),
  ]);
  const funded = racers.filter((r) => r.status === 200).length;
  check("T4", "concurrent funding applies exactly once", funded === 1,
        `${funded} of 2 succeeded`);

  // ---------------------------------------------------------------- T6 ----
  const idem = `replay-${uniq()}`;
  const ship1 = await call(`/api/trades/${tradeId}/ship`, { method: "POST", token: seller.token, idem });
  const ship2 = await call(`/api/trades/${tradeId}/ship`, { method: "POST", token: seller.token, idem });
  check("T6", "replaying a shipped call is a no-op, not a second transition",
        ship1.status === 200 && ship2.status === 200 &&
        JSON.stringify(ship1.body) === JSON.stringify(ship2.body),
        `${ship1.status}/${ship2.status}`);

  // ---------------------------------------------------------------- T5 ----
  const sellerReleases = await call(`/api/trades/${tradeId}/confirm-delivery`, {
    method: "POST", token: seller.token, idem: `rel-${uniq()}`,
  });
  check("T5", "seller cannot confirm delivery and release their own escrow",
        sellerReleases.status === 409 || sellerReleases.status === 404,
        `got ${sellerReleases.status}`);

  const outsiderReleases = await call(`/api/trades/${tradeId}/confirm-delivery`, {
    method: "POST", token: outsider.token, idem: `rel2-${uniq()}`,
  });
  check("T5", "an outsider cannot touch the trade at all",
        outsiderReleases.status === 404, `got ${outsiderReleases.status}`);

  const buyerConfirms = await call(`/api/trades/${tradeId}/confirm-delivery`, {
    method: "POST", token: buyer.token, idem: `rel3-${uniq()}`,
  });
  check("—", "buyer confirms delivery and the trade settles",
        buyerConfirms.status === 200 && buyerConfirms.body?.state === "settled",
        JSON.stringify(buyerConfirms.body));

  // ---------------------------------------------------------------- T7 ----
  const rate1 = await call(`/api/trades/${tradeId}/rate`, {
    method: "POST", token: buyer.token, body: { score: 5, comment: "clean" },
  });
  check("—", "buyer can rate a settled trade", rate1.status === 200, JSON.stringify(rate1.body));

  const rate2 = await call(`/api/trades/${tradeId}/rate`, {
    method: "POST", token: buyer.token, body: { score: 1, comment: "again" },
  });
  check("T7", "a second rating from the same side is refused", rate2.status === 409,
        `got ${rate2.status}`);

  const rateOutsider = await call(`/api/trades/${tradeId}/rate`, {
    method: "POST", token: outsider.token, body: { score: 5, comment: "nice" },
  });
  check("T7", "a non-counterparty cannot rate", rateOutsider.status === 404,
        `got ${rateOutsider.status}`);

  const rateOutOfRange = await call(`/api/trades/${tradeId}/rate`, {
    method: "POST", token: seller.token, body: { score: 99, comment: "" },
  });
  check("T7", "score is bounded", rateOutOfRange.status === 422, `got ${rateOutOfRange.status}`);

  // ---------------------------------------------------------------- T9 ----
  const inject = await call(`/api/listings?q=${encodeURIComponent("'; drop table listing; --")}`);
  check("T9", "injection through search is inert", inject.status === 200);
  const stillThere = await call("/api/listings");
  check("T9", "listing table survives", stillThere.status === 200 &&
        Array.isArray(stillThere.body?.listings));

  // --------------------------------------------------------------- T10 ----
  const xssTitle = `<img src=x onerror="alert(1)">`;
  const xssListing = await call("/api/listings", {
    method: "POST", token: seller.token,
    body: { title: xssTitle, description: `<script>alert(2)</script>`,
            condition: "Good", askMinor: 100_000 },
  });
  check("—", "payload stores as plain text", xssListing.status === 200);
  const html = await fetch(`${BASE}/`).then((r) => r.text());
  check("T10", "no unescaped script tag reaches the page",
        !html.includes("<script>alert(2)</script>") && !html.includes('onerror="alert(1)"'));

  // ---------------------------------------------------------------- T3 ----
  const integrity = await call("/api/integrity");
  const conservation = integrity.body?.checks?.find((c: any) => c.name === "I3_conservation");
  check("T3", "credits are conserved globally", conservation?.ok === true,
        JSON.stringify(conservation));
  check("T3", "every invariant holds", integrity.body?.ok === true,
        JSON.stringify(integrity.body?.checks?.filter((c: any) => !c.ok)));

  // --------------------------------------------------------- input rules ----
  const unknownField = await call("/api/listings", {
    method: "POST", token: seller.token,
    body: { title: "Valid title here", condition: "Good", askMinor: 1000,
            sellerAgentId: outsider.id, status: "sold" },
  });
  check("T8", "unknown fields are rejected, not ignored", unknownField.status === 422,
        `got ${unknownField.status}`);

  const negative = await call("/api/listings", {
    method: "POST", token: seller.token,
    body: { title: "Negative price", condition: "Good", askMinor: -5000 },
  });
  check("—", "negative prices are refused", negative.status === 422, `got ${negative.status}`);

  const ownBid = await call(`/api/listings/${listingId}/offers`, {
    method: "POST", token: seller.token, body: { amountMinor: 1000, message: "" },
  });
  check("—", "an agent cannot bid on its own listing",
        ownBid.status === 422 || ownBid.status === 404, `got ${ownBid.status}`);

  const noIdem = await call(`/api/trades/${tradeId}/fund`, { method: "POST", token: buyer.token });
  check("T6", "mutating calls require an idempotency key", noIdem.status === 422,
        `got ${noIdem.status}`);

  // --------------------------------------------------------------- T11 ----
  const burst = await Promise.all(
    Array.from({ length: 80 }, () =>
      call("/api/listings", {
        method: "POST", token: outsider.token,
        body: { title: "Rate limit probe listing", condition: "Good", askMinor: 1000 },
      })),
  );
  check("T11", "a write burst is rate limited",
        burst.some((r) => r.status === 429),
        `statuses: ${[...new Set(burst.map((r) => r.status))].join(",")}`);

  // ---- teardown ---------------------------------------------------------
  // A suite that leaves litter in the market it tests is a broken suite: the
  // probe listings above would otherwise be the first thing a visitor sees.
  const litter = [
    ...burst.filter((r) => r.status === 200).map((r) => r.body.id as string),
    xssListing.body?.id as string,
  ].filter(Boolean);
  let swept = 0;
  for (const id of litter) {
    const token = id === xssListing.body?.id ? seller.token : outsider.token;
    const w = await call(`/api/listings/${id}/withdraw`, { method: "POST", token });
    if (w.status === 200) swept++;
  }
  check("—", "the suite withdraws every listing it created",
        swept === litter.length, `${swept} of ${litter.length} withdrawn`);

  // ---------------------------------------------------------------------
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) {
    console.log("\nfailures:");
    for (const f of failures) console.log(`  · ${f}`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

export {};
