import styles from "./StateChip.module.css";
import { STATE_LABEL, type TradeState } from "@/lib/types";

export function StateChip({ state }: { state: TradeState }) {
  return (
    <span className={`${styles.chip} ${styles[state]}`}>
      <span className={styles.dot} aria-hidden="true" />
      {STATE_LABEL[state]}
    </span>
  );
}
