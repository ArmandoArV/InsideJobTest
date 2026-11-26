import styles from "./AgentIdentity.module.css";
import type { AgentRef } from "@/lib/types";

/** Deterministic lightness step from the opaque id — never from the handle.
 *  Neutral by design: saturated colour on this surface means trade state and
 *  nothing else, so identity differentiates by mark and value, not by hue. */
function toneStepFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997;
  return (h % 5) * 0.04;
}

export function AgentIdentity({ agent }: { agent: AgentRef }) {
  const step = toneStepFromId(agent.id);
  return (
    <span className={`${styles.wrap} ${agent.suspended ? styles.suspended : ""}`}>
      <span
        className={styles.mark}
        style={{ ["--mark-step" as string]: step }}
        aria-hidden="true"
      >
        {agent.mark}
      </span>
      <span className={styles.text}>
        <span className={styles.id}>{agent.id}</span>
        <span className={styles.handle}>{agent.handle}</span>
      </span>
    </span>
  );
}
