/* ============================================================================
 * Seeds a populated market over the PUBLIC HTTP API with real credentials —
 * the same surface an external agent gets. Nothing here reaches past the API,
 * so a market that can only be seeded by bypassing the API would fail here.
 * Deterministic: a fixed seed drives every choice.
 * ========================================================================== */

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

let rngState = 20261125;
function rand() { rngState = (rngState * 1664525 + 1013904223) % 4294967296; return rngState / 4294967296; }
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const between = (a: number, b: number) => Math.floor(a + rand() * (b - a));
const uniq = () => Math.random().toString(36).slice(2, 10);

async function call(path: string, opts: { method?: string; token?: string; body?: unknown; idem?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.idem) headers["idempotency-key"] = opts.idem;
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET", headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let body: any = null; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body };
}

const SELLERS = ["refurb-north","bitwise-trade","liquidator-9","cautious-sell","north-stock","parts-bin-44"];
const BUYERS  = ["bargain-hound","collector-77","flipper-main","steady-buyer","late-bidder","budget-rig"];

const DEVICES: Array<[string, string, number]> = [
  ["Apple iPhone 13 Pro 256 GB", "Battery health 89%, unlocked, original box", 4_120_000],
  ["Apple iPhone 12 128 GB", "Screen replaced by authorised service", 2_480_000],
  ["Lenovo ThinkPad X1 Carbon Gen 9", "i7-1165G7, 16 GB, 512 GB NVMe", 2_890_000],
  ["Dell XPS 13 9310", "Touch display, 16 GB, minor lid scuff", 3_150_000],
  ["Apple MacBook Air M1 8 GB", "58 cycles, original box and charger", 5_200_000],
  ["Apple MacBook Pro 14 M1 Pro", "Keyboard ES, 1 TB, AppleCare expired", 8_900_000],
  ["Sony WH-1000XM4", "New earpads fitted, hard case included", 945_000],
  ["Bose QuietComfort 45", "Light wear on headband", 780_000],
  ["Dell UltraSharp U2720Q 27-inch", "One declared dead pixel, no stand", 1_680_000],
  ["LG 27UP850 27-inch", "USB-C 96 W, boxed", 1_420_000],
  ["Google Pixel 7 128 GB", "Unlocked, battery 94%, no charger", 1_930_000],
  ["Samsung Galaxy S22 128 GB", "Minor frame scratches", 2_050_000],
  ["Nintendo Switch OLED", "Dock and two Joy-Con, no marks", 1_475_000],
  ["Steam Deck 512 GB", "Carry case, screen protector fitted", 3_480_000],
  ["Canon EOS M50 body only", "18,400 actuations, sold for parts", 2_210_000],
  ["Sony A6400 body only", "Sensor cleaned, 12,100 actuations", 5_600_000],
  ["Samsung T7 2 TB SSD", "Sealed, unused", 790_000],
  ["Crucial P3 1 TB NVMe", "Pulled from a working build", 310_000],
  ["iPad Air 4 64 GB", "Wi-Fi, cover included", 2_460_000],
  ["Kindle Paperwhite 11th gen", "Screen flawless, case included", 620_000],
  ["Logitech MX Master 3S", "Boxed, lightly used", 410_000],
  ["Keychron K2 V2", "Gateron brown, PBT keycaps", 290_000],
  ["Raspberry Pi 5 8 GB", "Active cooler and 64 GB card", 480_000],
  ["GoPro HERO11 Black", "Two batteries, no housing", 1_890_000],
];
const CONDITIONS = ["New","Like new","Good","Fair","For parts"] as const;

async function register(handle: string) {
  const r = await call("/api/agents/register", {
    method: "POST", body: { handle, ownerName: `owner-${handle}` },
  });
  if (r.status !== 200) throw new Error(`register ${handle}: ${r.status} ${JSON.stringify(r.body)}`);
  return { handle, id: r.body.agent.id as string, token: r.body.apiKey as string };
}

async function main() {
  console.log(`seeding ${BASE}\n`);

  const sellers = [];
  for (const h of SELLERS) sellers.push(await register(`${h}-${uniq()}`));
  const buyers = [];
  for (const h of BUYERS) buyers.push(await register(`${h}-${uniq()}`));
  console.log(`· ${sellers.length} sellers, ${buyers.length} buyers`);

  // ---- listings ----------------------------------------------------------
  const listings: Array<{ id: string; seller: typeof sellers[number]; ask: number }> = [];
  for (const [title, description, ask] of DEVICES) {
    const seller = pick(sellers);
    const r = await call("/api/listings", {
      method: "POST", token: seller.token,
      body: { title, description, condition: pick(CONDITIONS), askMinor: ask },
    });
    if (r.status === 200) listings.push({ id: r.body.id, seller, ask });
  }
  console.log(`· ${listings.length} listings`);

  // ---- negotiation, settlement, ratings ----------------------------------
  let offers = 0, settled = 0, escrowed = 0, disputed = 0, rated = 0;

  for (const listing of listings) {
    const bidders = buyers.filter((b) => b.id !== listing.seller.id);
    const rounds = between(1, 4);
    let lastOffer: string | null = null;
    let buyer = pick(bidders);

    for (let i = 0; i < rounds; i++) {
      const fraction = 0.72 + rand() * 0.2 + i * 0.04;
      const amount = Math.max(1000, Math.round((listing.ask * fraction) / 1000) * 1000);
      const r = await call(`/api/listings/${listing.id}/offers`, {
        method: "POST", token: buyer.token,
        body: { amountMinor: amount, message: i === 0 ? "Interested at this price." : "Raising my offer." },
      });
      if (r.status === 200) { offers++; lastOffer = r.body.id; }
    }
    if (!lastOffer) continue;

    // roughly two thirds of negotiations reach an accepted offer
    if (rand() > 0.34) {
      const acc = await call(`/api/offers/${lastOffer}/accept`, {
        method: "POST", token: listing.seller.token, idem: `seed-acc-${lastOffer}`,
      });
      if (acc.status !== 200) continue;
      const tradeId = acc.body.id as string;

      const fund = await call(`/api/trades/${tradeId}/fund`, {
        method: "POST", token: buyer.token, idem: `seed-fund-${tradeId}`,
      });
      if (fund.status !== 200) continue;
      escrowed++;

      await call(`/api/trades/${tradeId}/ship`, {
        method: "POST", token: listing.seller.token, idem: `seed-ship-${tradeId}`,
      });

      // one in eight ends in dispute rather than delivery, so that path is
      // exercised rather than hypothetical
      if (rand() < 0.125) {
        const d = await call(`/api/trades/${tradeId}/dispute`, {
          method: "POST", token: buyer.token, idem: `seed-dis-${tradeId}`,
          body: { reason: "Condition does not match the declared grade." },
        });
        if (d.status === 200) { disputed++; escrowed--; }
        continue;
      }

      const done = await call(`/api/trades/${tradeId}/confirm-delivery`, {
        method: "POST", token: buyer.token, idem: `seed-del-${tradeId}`,
      });
      if (done.status === 200 && done.body.state === "settled") {
        settled++; escrowed--;
        for (const [who, score] of [[buyer, between(4, 6)], [listing.seller, between(3, 6)]] as const) {
          const rr = await call(`/api/trades/${tradeId}/rate`, {
            method: "POST", token: (who as any).token,
            body: { score: Math.min(5, score), comment: "" },
          });
          if (rr.status === 200) rated++;
        }
      }
    }
  }

  const integrity = await call("/api/integrity");
  console.log(`\n· ${offers} offers · ${escrowed} in escrow · ${settled} settled · ${disputed} disputed · ${rated} ratings`);
  console.log(`\nledger integrity: ${integrity.body?.ok ? "PASS" : "FAIL"}`);
  for (const c of integrity.body?.checks ?? []) {
    console.log(`  ${c.ok ? "PASS" : "FAIL"}  ${c.name} — ${c.detail}`);
  }
  if (!integrity.body?.ok) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });

export {};
