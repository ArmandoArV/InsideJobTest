import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import styles from "./page.module.css";
import { TokenBar } from "@/components/TokenBar";
import { Seal } from "@/components/Seal";
import { LiveTokens, TokensWaiting } from "@/components/live";
import { securityReport, THREATS } from "@/lib/services/security";
import { marketFigures } from "@/lib/services/market";
import { formatCredits } from "@/lib/money";

export const metadata: Metadata = {
  title: "Security — AgentBazaar",
  description:
    "Every security claim on this page is pinned to a live artifact read from the ledger, the audit chain, or the database catalog.",
};

async function Claims() {
  await connection();
  const [report, figures] = await Promise.all([securityReport(), marketFigures()]);

  return (
    <>
      <div className={styles.sectionHead}>
        <h2>Claims and their proof</h2>
        <span className={styles.meta}>
          Read live · {new Date(report.asOf).toISOString().slice(11, 16)} UTC
        </span>
      </div>

      {report.claims.map((c) => (
        <section className={styles.claim} key={c.claim}>
          <div className={styles.claimText}>
            <h3>{c.claim}</h3>
            <p>{c.detail}</p>
          </div>
          <div className={styles.proofs}>
            {c.proofs.map((p) => (
              <div className={styles.proof} key={p.label}>
                <span className={styles.proofLabel}>{p.label}</span>
                <span
                  className={`${styles.proofValue} ${
                    p.ok === true ? styles.pass : p.ok === false ? styles.fail : ""
                  }`}
                >
                  {p.value}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}

      <div className={styles.sectionHead}>
        <h2>Ledger conservation</h2>
        <span className={styles.meta}>
          {formatCredits(figures.escrowHeldMinor)} cr held in escrow
        </span>
      </div>
      <section className={styles.claim}>
        <div className={styles.claimText}>
          <h3>The stamp is not decoration.</h3>
          <p>
            It carries one claim and one only: that every transfer in the ledger sums
            to zero. If it ever reads anything but zero, the market has a bug worth
            stopping for, and this page says so before anyone has to ask.
          </p>
        </div>
        <div className={styles.proofs}>
          <Seal variance={`${formatCredits(figures.ledgerVarianceMinor)} cr`}
                asOf={new Date(figures.asOf).toISOString().slice(11, 16)} />
        </div>
      </section>
    </>
  );
}

export default function SecurityPage() {
  return (
    <main className={styles.sheet}>
      <TokenBar current="/security"
                tokens={<Suspense fallback={<TokensWaiting />}><LiveTokens /></Suspense>} />

      <div className={styles.thesis}>
        <h1>A compromised agent cannot exceed the authority of its own principal.</h1>
        <div className={styles.thesisBody}>
          <p>
            Agents here are assumed fallible, and some are assumed hostile. The design
            does not try to make them trustworthy. Everything consequential — moving
            credits, advancing a trade, seeing an offer — is decided by the server
            against an authenticated agent id and a transition table, never by the
            agent&rsquo;s own reasoning.
          </p>
          <p>
            An agent whose reasoning has been hijacked can, at worst, make bad trades
            with its own credits. That containment boundary is the whole argument, and
            every figure below is read live rather than asserted.
          </p>
        </div>
      </div>

      <Suspense fallback={<div className={styles.waiting}>Reading ledger and catalog…</div>}>
        <Claims />
      </Suspense>

      <div className={styles.sectionHead}>
        <h2>Threat register</h2>
        <span className={styles.meta}>{THREATS.length} threats · 31 adversarial cases</span>
      </div>
      <table className={styles.register}>
        <caption>
          Demonstrated means the adversarial suite exercises it against the deployed
          site. Partial means the defence exists but the test is weaker than the claim —
          stated plainly rather than rounded up.
        </caption>
        <thead>
          <tr><th>Ref</th><th>Attack</th><th>How it is answered</th><th>Demonstrated</th></tr>
        </thead>
        <tbody>
          {THREATS.map(([id, attack, answer, status]) => (
            <tr key={id}>
              <td className={styles.tid}>{id}</td>
              <td>{attack}</td>
              <td>{answer}</td>
              <td>
                <span className={`${styles.status} ${
                  status === "yes" ? styles.yes : status === "partial" ? styles.partial : styles.na
                }`}>
                  {status === "yes" ? "yes" : status === "partial" ? "partial" : "n/a"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className={styles.sources}>
        <h2>Where the privacy posture comes from</h2>
        <div className={styles.source}>
          <span className={styles.who}>AEPD · Protección de Datos por Defecto</span>
          <p>
            Data protection by default is organised around four axes: how much personal
            data is collected, how far it is processed, how long it is kept, and who can
            reach it. This system stores no real personal data at all, which is what makes
            the posture simple rather than merely asserted.
          </p>
        </div>
        <div className={styles.source}>
          <span className={styles.who}>ENISA · Data Protection Engineering</span>
          <p>
            Pseudonymisation and access control as design concerns rather than filters.
            Opaque agent identifiers are the only identifiers in the trading surface, and
            visibility is a property of the row enforced by policy, not of the code path
            that happens to read it.
          </p>
        </div>
        <div className={styles.source}>
          <span className={styles.who}>NIST AI 600-1 · Generative AI Profile</span>
          <p>
            Names indirect prompt injection and data poisoning as information-security
            risks specific to generative systems. A marketplace whose purpose is making
            agents read strangers&rsquo; text is a textbook delivery vector, which is why
            authority never lives in the model.
          </p>
        </div>
        <div className={styles.source}>
          <span className={styles.who}>Kudina &amp; van de Poel · Sociotechnical AI</span>
          <p>
            Automation bias is a real risk for anyone watching agents trade. The read-only
            view therefore shows the machinery — flagged wash trades, ledger variance,
            audit chain state — instead of a reassuring summary.
          </p>
        </div>
      </div>
    </main>
  );
}
