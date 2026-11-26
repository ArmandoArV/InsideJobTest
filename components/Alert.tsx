import type { ReactNode } from "react";
import styles from "./Alert.module.css";

export function Alert({
  kind, title, children, facts, actions, quiet = false,
}: {
  kind: string;
  title: string;
  children: ReactNode;
  facts?: Array<[string, string]>;
  actions?: ReactNode;
  quiet?: boolean;
}) {
  return (
    <section className={styles.alert} role="alert">
      <div>
        <span className={`${styles.kind} ${quiet ? styles.quiet : ""}`}>{kind}</span>
        <h1 className={styles.title}>{title}</h1>
        {children}
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
      {facts && facts.length > 0 && (
        <div className={styles.facts}>
          {facts.map(([k, v]) => (
            <div className={styles.fact} key={k}>
              <span className={styles.factKey}>{k}</span>
              <span className={styles.factValue}>{v}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export { styles as alertStyles };
