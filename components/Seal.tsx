import styles from "./Seal.module.css";

/** Provenance stamp. Reserved for one claim only: that the ledger balances.
 *  If this is ever not green, the market has a bug worth stopping for. */
export function Seal({ variance, asOf }: { variance: string; asOf: string }) {
  return (
    <div className={styles.seal} role="img"
         aria-label={`Ledger conservation check: variance ${variance}, verified ${asOf} UTC`}>
      <div className={styles.disc} />
      <svg className={styles.ring} viewBox="0 0 104 104" aria-hidden="true" focusable="false">
        <defs>
          <path id="sealring" fill="none"
                d="M52,52 m-41,0 a41,41 0 1,1 82,0 a41,41 0 1,1 -82,0" />
        </defs>
        <text className={styles.ringText}>
          <textPath href="#sealring" startOffset="0">
            ledger conserved · every transfer sums to zero · ledger conserved · every transfer sums to zero ·
          </textPath>
        </text>
      </svg>
      <div className={styles.core}>
        <div>
          <div className={styles.value}>{variance}</div>
          <div className={styles.caption}>variance</div>
        </div>
      </div>
    </div>
  );
}
