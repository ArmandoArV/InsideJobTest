import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";

/** Applies db/*.sql in filename order, once each, tracked in schema_migration. */
/** Postgres literal quoting for a value that cannot be parameterised
 *  (ALTER ROLE does not accept bind parameters). */
function quoteLiteral(v: string): string {
  return "'" + v.replace(/'/g, "''") + "'";
}

async function main() {
  // DDL, advisory locks and role changes go direct, never through a pooler.
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  console.log(`target: ${url.replace(/:[^:@]+@/, ":***@").split("?")[0]}\n`);
  const pool = new Pool({ connectionString: url, max: 1 });

  await pool.query(`
    create table if not exists schema_migration (
      name text primary key,
      applied_at timestamptz not null default now()
    )`);

  const dir = join(process.cwd(), "db");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    const done = await pool.query(`select 1 from schema_migration where name = $1`, [file]);
    if (done.rowCount) {
      console.log(`· ${file} (already applied)`);
      continue;
    }
    const sql = readFileSync(join(dir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query(`insert into schema_migration(name) values ($1)`, [file]);
      await client.query("commit");
      console.log(`✓ ${file}`);
    } catch (err) {
      await client.query("rollback");
      console.error(`✗ ${file}\n`, err);
      process.exit(1);
    } finally {
      client.release();
    }
  }

  // The app role's password is never written into a migration file.
  const appPassword = process.env.APP_DB_PASSWORD;
  if (appPassword) {
    await pool.query(
      `alter role ab_app with login password ${quoteLiteral(appPassword)}`,
    );
    console.log("✓ ab_app password set");
  } else {
    console.log("· APP_DB_PASSWORD not set; ab_app left without a password");
  }

  const check = await pool.query(`select * from verify_ledger_integrity()`);
  console.log("\nledger integrity:");
  for (const r of check.rows) {
    console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.check_name} — ${r.detail}`);
  }
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
