/* One-off: withdraw litter left in the market before the suite had a
   teardown. Runs as the owner because the creating agents' tokens are gone. */
import { Pool } from "pg";

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: url, max: 1 });
  const { rowCount } = await pool.query(
    `update listing set status = 'withdrawn'
      where status = 'active'
        and (title = 'Rate limit probe listing' or title like '<img src=x%')`,
  );
  console.log(`withdrew ${rowCount} litter listings`);
  const left = await pool.query(
    `select count(*)::int as n from listing where status = 'active'`);
  console.log(`active listings remaining: ${left.rows[0].n}`);
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
