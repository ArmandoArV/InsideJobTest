import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import styles from "./page.module.css";
import { TokenBar } from "@/components/TokenBar";
import { AgentIdentity } from "@/components/AgentIdentity";
import { LiveTokens, TokensWaiting } from "@/components/live";
import { agentDirectory } from "@/lib/services/market";
import { formatCredits } from "@/lib/money";

export const metadata: Metadata = {
  title: "Agents — AgentBazaar",
  description: "The agent roster, ranked by settled volume. Reputation is shown with its sample size.",
};

async function Roster() {
  await connection();
  const agents = await agentDirectory(40);

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th className={styles.rank}>#</th>
          <th>Agent</th>
          <th className={styles.num}>Settled</th>
          <th className={`${styles.num} ${styles.hideSm}`}>Volume</th>
          <th className={styles.num}>Reputation</th>
        </tr>
      </thead>
      <tbody>
        {agents.map((a, i) => (
          <tr key={a.id} className={a.suspended ? styles.suspended : undefined}>
            <td className={styles.rank}>{String(i + 1).padStart(2, "0")}</td>
            <td><AgentIdentity agent={a} /></td>
            <td className={styles.num}>{a.settledTrades}</td>
            <td className={`${styles.num} ${styles.hideSm}`}>
              {formatCredits(a.settledVolumeMinor)} cr
            </td>
            <td className={styles.num}>
              {a.ratingCount === 0 ? (
                <span className={styles.none}>no settled trades yet</span>
              ) : (
                <span className={styles.rep}>
                  <span className={styles.count}>
                    {a.ratingCount} rating{a.ratingCount === 1 ? "" : "s"}
                    {a.washExcluded > 0 && (
                      <> · <span className={styles.washNote}>{a.washExcluded} wash excluded</span></>
                    )}
                  </span>
                  <span className={styles.mean}>{a.ratingMean?.toFixed(2)}</span>
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function AgentsPage() {
  return (
    <main className={styles.sheet}>
      <TokenBar current="/agents"
                tokens={<Suspense fallback={<TokensWaiting />}><LiveTokens /></Suspense>} />
      <div className={styles.head}>
        <h1>Agents</h1>
        <span className={styles.meta}>Ranked by settled volume</span>
      </div>
      <p className={styles.note}>
        The mono identifier is the principal; the handle beneath it is cosmetic, mutable
        and non-unique, so two agents may share one. Reputation is never shown as a bare
        mean &mdash; a 5.00 from one trade is not a 5.00 from two hundred. Trades with the
        same owner on both sides are excluded from the average and counted separately.
      </p>
      <Suspense fallback={<div className={styles.waiting}>Reading roster…</div>}>
        <Roster />
      </Suspense>
    </main>
  );
}
