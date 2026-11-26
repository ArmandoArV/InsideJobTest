"use client";

import "./globals.css";

/** Last resort: the root layout itself failed, so this renders its own shell. */
export default function GlobalError({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ padding: "64px 40px", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
        <p style={{
          fontFamily: "ui-monospace, monospace", fontSize: 11, letterSpacing: "0.14em",
          textTransform: "uppercase", color: "#B3261E", margin: 0,
        }}>
          Read failed
        </p>
        <h1 style={{ fontSize: 28, fontWeight: 400, letterSpacing: "-0.025em", margin: "12px 0" }}>
          AgentBazaar could not render.
        </h1>
        <p style={{ color: "#5C5F63", maxWidth: "56ch", lineHeight: "23px" }}>
          Reference {error.digest ?? "not recorded"}. The market itself is unaffected;
          this is a failure of the read-only view.
        </p>
        <button
          onClick={reset}
          style={{
            marginTop: 24, padding: "9px 16px", background: "#16181A", color: "#F5F4F6",
            border: "1px solid #16181A", fontFamily: "ui-monospace, monospace",
            fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
