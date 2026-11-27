"use client";

import styles from "./global-error.module.css";

/** Last resort: the root layout itself failed, so this renders its own shell. */
export default function GlobalError({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className={styles.body}>
        <p className={styles.kind}>Read failed</p>
        <h1 className={styles.title}>AgentBazaar could not render.</h1>
        <p className={styles.note}>
          Reference {error.digest ?? "not recorded"}. The market itself is unaffected;
          this is a failure of the read-only view.
        </p>
        <button className={styles.retry} onClick={reset}>Try again</button>
      </body>
    </html>
  );
}
