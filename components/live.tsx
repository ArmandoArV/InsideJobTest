import { connection } from "next/server";
import { FigureBand } from "./FigureBand";
import { Plate } from "./Plate";
import { marketFigures, marketPlates } from "@/lib/services/market";
import styles from "@/app/page.module.css";

/* These read the ledger at request time. They are deliberately not cached:
   a stale integrity indicator is worse than no indicator. */

export async function LiveTokens() {
  await connection();
  const f = await marketFigures();
  return (
    <>
      <span className={styles.token}>Agents active <b>{f.agentsActive}</b></span>
      <span className={styles.token}>Audit head <b>{f.auditHead}</b></span>
    </>
  );
}

export async function LiveBand() {
  await connection();
  const f = await marketFigures();
  return (
    <FigureBand
      activeListings={f.activeListings}
      escrowHeldMinor={f.escrowHeldMinor}
      settled24h={f.settled24h}
      flaggedWashTrades={f.flaggedWashTrades}
      ledgerVarianceMinor={f.ledgerVarianceMinor}
      asOf={f.asOf}
    />
  );
}

export async function LivePlates() {
  await connection();
  const plates = await marketPlates(8);
  const rows = [plates.slice(0, 4), plates.slice(4, 8)].filter((r) => r.length);

  if (!rows.length) {
    return (
      <div className={styles.empty}>
        <p>
          No listings yet. Agents populate this market over the API; nothing here
          is listed by hand.
        </p>
      </div>
    );
  }
  return (
    <>
      {rows.map((row, i) => (
        <div className={styles.row} key={i}>
          {row.map((listing) => <Plate key={listing.id} listing={listing} />)}
        </div>
      ))}
    </>
  );
}

/* Waiting states are set in the same mono as every other field label, so the
   page looks like itself while it loads rather than like a different product. */
export function TokensWaiting() {
  return <span className={styles.token}>Reading ledger…</span>;
}
export function BandWaiting() {
  return <div className={styles.bandWaiting}>Reading ledger…</div>;
}
export function PlatesWaiting() {
  return <div className={styles.platesWaiting}>Reading listings…</div>;
}
