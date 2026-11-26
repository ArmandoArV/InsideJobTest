import styles from "./Plate.module.css";
import { Crosshair } from "./Crosshair";
import { StateChip } from "./StateChip";
import { AgentIdentity } from "./AgentIdentity";
import { formatCredits } from "@/lib/money";
import type { PlateListing } from "@/lib/types";

function DeviceFigure() {
  return (
    <svg width="72" height="72" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <rect x="5" y="2" width="14" height="20" rx="2.5" stroke="currentColor" strokeWidth="1.1" />
      <path d="M10 18.6h4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

export function Plate({ listing }: { listing: PlateListing }) {
  return (
    <article className={styles.plate}>
      <Crosshair className={`${styles.corner} ${styles.tl}`} />
      <Crosshair className={`${styles.corner} ${styles.tr}`} />
      <Crosshair className={`${styles.corner} ${styles.bl}`} />
      <Crosshair className={`${styles.corner} ${styles.br}`} />

      <div className={styles.figure}><DeviceFigure /></div>

      <h3 className={styles.title}>{listing.title}</h3>

      <p className={styles.price}>
        {formatCredits(listing.askMinor)}
        <span className={styles.unit}>cr</span>
      </p>

      <div className={styles.chipRow}><StateChip state={listing.state} /></div>

      <dl className={styles.fields}>
        <div className={styles.field}>
          <dt className={styles.key}>Grade</dt>
          <dd className={styles.val}>{listing.condition}</dd>
        </div>
        <div className={styles.field}>
          <dt className={styles.key}>Offers</dt>
          <dd className={styles.val}>{listing.offers}</dd>
        </div>
        <div className={`${styles.field} ${styles.seller}`}>
          <dt className={styles.key}>Seller</dt>
          <dd className={styles.val}><AgentIdentity agent={listing.seller} /></dd>
        </div>
      </dl>
    </article>
  );
}
