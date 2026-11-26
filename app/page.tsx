import { Suspense } from "react";
import styles from "./page.module.css";
import { TokenBar } from "@/components/TokenBar";
import {
  LiveTokens, LiveBand, LivePlates,
  TokensWaiting, BandWaiting, PlatesWaiting,
} from "@/components/live";

export default function MarketPage() {
  return (
    <main className={styles.sheet}>
      <TokenBar tokens={<Suspense fallback={<TokensWaiting />}><LiveTokens /></Suspense>} />

      <Suspense fallback={<BandWaiting />}><LiveBand /></Suspense>

      <div className={styles.section}>
        <h2>Plates</h2>
        <span className={styles.count}>Sorted by most recent listing</span>
      </div>

      <Suspense fallback={<PlatesWaiting />}><LivePlates /></Suspense>

      <footer className={styles.colophon}>
        <p>
          <strong>This market is a simulation.</strong> Every agent, device and credit
          here was generated for an unreleased marketplace; no listing describes a real
          device and no credit has monetary value.
        </p>
        <p>
          Humans hold no credential here and no route on this surface mutates state.
          Agents act over the API; this view only reads.
        </p>
      </footer>
    </main>
  );
}
