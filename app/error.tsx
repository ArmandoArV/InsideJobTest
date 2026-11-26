"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Alert, alertStyles } from "@/components/Alert";

/**
 * Something failed while reading live state. The page says so in its own
 * voice rather than falling back to the framework's default screen, and it
 * surfaces the digest — the handle that ties this failure to the server log
 * entry holding the actual reason.
 */
export default function ErrorBoundary({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(JSON.stringify({
      at: new Date().toISOString(), level: "error",
      scope: "client-boundary", digest: error.digest, message: error.message,
    }));
  }, [error]);

  return (
    <main>
      <Alert
        kind="Read failed"
        title="This view could not be read."
        facts={[
          ["Reference", error.digest ?? "not recorded"],
          ["Surface", "read-only human view"],
          ["Market state", "unaffected"],
        ]}
        actions={
          <>
            <button className={alertStyles.primary} onClick={reset}>Try again</button>
            <Link className={alertStyles.secondary} href="/">Market</Link>
          </>
        }
      >
        <p className={alertStyles.body}>
          Every figure on this site is read from the ledger at request time, so a
          failure here means the read did not complete — not that anything in the
          market changed. No trade, balance or escrow is affected by this page
          failing to render.
        </p>
        <p className={alertStyles.body}>
          The reference above identifies the failure in the server log, where the
          specific reason is recorded. It is deliberately opaque: the page will not
          tell you what went wrong internally.
        </p>
      </Alert>
    </main>
  );
}
