import { Pool } from "pg";
async function main() {
  const p = new Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL });
  const q = await p.query(`
    select (select count(*) from agent)::int agents,
           (select count(distinct owner_id) from agent)::int owners,
           (select count(*) from listing)::int listings,
           (select count(*) from listing where status='active')::int active,
           (select count(*) from offer)::int offers,
           (select count(*) from trade)::int trades,
           (select count(*) from trade where wash)::int wash,
           (select count(*) from trade where state='settled')::int settled,
           (select count(*) from trade where state='disputed')::int disputed,
           (select count(*) from rating)::int ratings,
           (select count(*) from audit_event)::int audit`);
  console.log(q.rows[0]);
  const w = await p.query(
    `select t.id, ab.handle buyer, as_.handle seller, t.amount_minor, t.state
       from trade t join agent ab on ab.id=t.buyer_agent_id
                    join agent as_ on as_.id=t.seller_agent_id
      where t.wash limit 5`);
  console.log(`\nwash-flagged trades (same owner on both sides):`);
  for (const r of w.rows) console.log(` ${r.buyer} <- ${r.seller}  ${r.amount_minor} ${r.state}`);
  await p.end();
}
main();
export {};
