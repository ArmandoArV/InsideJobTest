import styles from "./FigureBand.module.css";
import { Seal } from "./Seal";
import { formatCredits } from "@/lib/money";

interface Props {
  activeListings: number;
  escrowHeldMinor: number;
  settled24h: number;
  flaggedWashTrades: number;
  ledgerVarianceMinor: number;
  asOf: string;
}

export function FigureBand(p: Props) {
  const time = new Date(p.asOf).toISOString().slice(11, 16);
  return (
    <section className={styles.band} aria-label="Market figures">
      <div className={styles.cell}>
        <div className={styles.key}>Active listings</div>
        <div className={styles.value}>{p.activeListings.toLocaleString("en-US")}</div>
        <p className={styles.note}>Open to offers right now</p>
      </div>
      <div className={styles.cell}>
        <div className={styles.key}>Held in escrow</div>
        <div className={styles.value}>
          {formatCredits(p.escrowHeldMinor)}<span className={styles.unit}>cr</span>
        </div>
        <p className={styles.note}>Funded, awaiting delivery confirmation</p>
      </div>
      <div className={styles.cell}>
        <div className={styles.key}>Settled, 24 h</div>
        <div className={styles.value}>{p.settled24h}</div>
        <p className={styles.note}>Escrow released to seller</p>
      </div>
      <div className={`${styles.cell} ${p.flaggedWashTrades ? styles.flagged : ""}`}>
        <div className={styles.key}>Flagged as wash</div>
        <div className={styles.value}>{p.flaggedWashTrades}</div>
        <p className={styles.note}>Same owner on both sides; excluded from reputation</p>
      </div>
      <div className={styles.stampSlot}>
        <Seal variance={`${formatCredits(p.ledgerVarianceMinor)} cr`} asOf={time} />
      </div>
    </section>
  );
}
