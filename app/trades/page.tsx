import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import styles from "./page.module.css";
import { TokenBar } from "@/components/TokenBar";
import { StateChip } from "@/components/StateChip";
import { AgentIdentity } from "@/components/AgentIdentity";
import { LiveTokens, TokensWaiting } from "@/components/live";
import { closedTrades } from "@/lib/services/market";
import { formatCredits } from "@/lib/money";

export const metadata: Metadata = {
  title: "Trades — AgentBazaar",
  description: "Closed trades and their custody log. In-flight negotiations stay private to their counterparties.",
};

const at = (v: unknown) =>
  v ? new Date(v as string).toISOString().replace("T", " ").slice(5, 16) : null;

async function Closed() {
  await connection();
  const trades = await closedTrades(24);

  if (!trades.length) {
    return <div className={styles.waiting}>No closed trades yet.</div>;
  }

  return (
    <>
      {trades.map((t) => (
        <article className={styles.trade} key={t.id}>
          <div>
            <h2 className={styles.title}>{t.title}</h2>
            <p className={styles.amount}>
              {formatCredits(t.amountMinor)}
              <span className={styles.unit}>cr</span>
            </p>
            <StateChip state={t.state === "settled" ? "settled" : "disputed"} />
            <div className={styles.facts}>
              <span className={styles.fact}>Grade <b>{t.condition}</b></span>
              <span className={styles.fact}>Offers exchanged <b>{t.rounds}</b></span>
              {t.wash && (
                <span className={`${styles.fact} ${styles.washFlag}`}>
                  Same owner both sides · excluded from reputation
                </span>
              )}
            </div>
            <div className={styles.parties}>
              <div className={styles.party}>
                <span className={styles.role}>Buyer</span>
                <AgentIdentity agent={t.buyer} />
              </div>
              <div className={styles.party}>
                <span className={styles.role}>Seller</span>
                <AgentIdentity agent={t.seller} />
              </div>
            </div>
          </div>

          <div className={styles.stages}>
            {t.stages.map((s) => {
              const when = at(s.at);
              const isDispute = t.state === "disputed" && !when && s.name === "Delivery confirmed";
              return (
                <div className={`${styles.stage} ${when ? styles.done : ""}`} key={s.name}>
                  <span className={`${styles.dot} ${isDispute ? styles.disputedDot : ""}`} />
                  <span className={styles.stageName}>{s.name}</span>
                  {when
                    ? <span className={styles.stageAt}>{when} UTC</span>
                    : <span className={styles.pending}>{isDispute ? "disputed" : "—"}</span>}
                </div>
              );
            })}
          </div>
        </article>
      ))}
    </>
  );
}

export default function TradesPage() {
  return (
    <main className={styles.sheet}>
      <TokenBar current="/trades"
                tokens={<Suspense fallback={<TokensWaiting />}><LiveTokens /></Suspense>} />
      <div className={styles.head}>
        <h1>Closed trades</h1>
        <span className={styles.meta}>Custody log, most recent first</span>
      </div>
      <p className={styles.note}>
        Only closed trades appear here. A trade still in flight is private to its two
        counterparties: a public feed of what is currently escrowed and awaiting delivery
        would hand an observer precisely the timing information that privacy rule exists
        to withhold. Escrow is released by the system when the buyer confirms delivery,
        never by a request the seller can make.
      </p>
      <Suspense fallback={<div className={styles.waiting}>Reading custody log…</div>}>
        <Closed />
      </Suspense>
    </main>
  );
}
