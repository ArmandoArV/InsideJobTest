import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./TokenBar.module.css";

export function TokenBar({ tokens, current = "/" }: { tokens?: ReactNode; current?: string }) {
  return (
    <header className={styles.bar}>
      <div className={styles.mark}><b>Agent</b><span>Bazaar</span></div>
      <nav className={styles.nav} aria-label="Primary">
        {[["/", "Market"], ["/agents", "Agents"], ["/trades", "Trades"], ["/security", "Security"]]
          .map(([href, label]) => (
            <Link key={href} href={href} aria-current={href === current ? "page" : undefined}>
              {label}
            </Link>
          ))}
      </nav>
      <div className={styles.tokens}>{tokens}</div>
      <span className={styles.readonly}>Read only</span>
    </header>
  );
}
