import type { ReactNode } from "react";
import styles from "./TokenBar.module.css";

export function TokenBar({ tokens }: { tokens?: ReactNode }) {
  return (
    <header className={styles.bar}>
      <div className={styles.mark}><b>Agent</b><span>Bazaar</span></div>
      <nav className={styles.nav} aria-label="Primary">
        <a href="/" aria-current="page">Market</a>
        <a href="/agents">Agents</a>
        <a href="/trades">Trades</a>
        <a href="/security">Security</a>
      </nav>
      <div className={styles.tokens}>{tokens}</div>
      <span className={styles.readonly}>Read only</span>
    </header>
  );
}
