// agent-commerce — seed a seller agent with a private history that clears the
// marketplace badge (>= 50 jobs, >= 95% success, >= $10k volume), then prove it.
//
//   npm run seed:seller
//   npm run seed:seller -- --json
//
// Against a real network, replace the simulator with the deployed contract and
// the wallet client in `src/lib/midnight`.

import { MarketSim } from "../test/simulator.js";
import { Agent, DEMO_BADGE, demoSellerLedger } from "../src/runtime.js";

const jsonOnly = process.argv.includes("--json");
const log = (...a: unknown[]) => !jsonOnly && console.log(...a);

const arbiterSecret = new Uint8Array(32).fill(1);
const sellerSecret = process.env.AGENTMKT_SELLER_SECRET
  ? Uint8Array.from(Buffer.from(process.env.AGENTMKT_SELLER_SECRET, "hex"))
  : new Uint8Array(32).fill(2);
const sellerSalt = new Uint8Array(32).fill(9);

function toHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

async function main() {
  const sim = await MarketSim.deploy(arbiterSecret);
  const seller = new Agent("seller", "seller", sellerSecret, sellerSalt);

  await sim.stakeBond(seller.secret, 20_000n);
  seller.seedLedger(demoSellerLedger());
  await sim.updateReputation(seller.privateState);

  const stats = seller.privateState.jobLedger.reduce(
    (acc, j) => {
      if (j.client.every((b) => b === 0)) return acc;
      acc.total += 1;
      if (j.success) {
        acc.ok += 1;
        acc.volume += j.price;
      }
      return acc;
    },
    { total: 0, ok: 0, volume: 0n },
  );

  const badgeOk = await sim.proveReputation(
    seller.privateState,
    DEMO_BADGE.minJobs,
    DEMO_BADGE.minRateBps,
    DEMO_BADGE.minVolume,
  );

  log(`seller agent id : ${toHex(seller.id)}`);
  log(`bond staked     : ${sim.ledger.bonds.lookup(seller.id)}`);
  log(`private ledger  : ${stats.total} jobs, ${stats.ok} successful, volume ${stats.volume}`);
  log(`success rate    : ${((stats.ok / stats.total) * 100).toFixed(1)}%`);
  log(`commitment      : ${toHex(sim.ledger.reputationCommitments.lookup(seller.id))}`);
  log("");
  log(
    `proveReputation(>=${DEMO_BADGE.minJobs} jobs, >=${Number(DEMO_BADGE.minRateBps) / 100}%, ` +
      `>=$${DEMO_BADGE.minVolume}) -> ${badgeOk ? "PASS ✅  badge unlocked" : "FAIL ❌"}`,
  );

  console.log(
    JSON.stringify(
      {
        sellerAgentId: toHex(seller.id),
        sellerSecret: toHex(seller.secret),
        ledgerSalt: toHex(seller.salt),
        commitment: toHex(sim.ledger.reputationCommitments.lookup(seller.id)),
        stats: { total: stats.total, successful: stats.ok, volume: stats.volume.toString() },
        badge: { ...DEMO_BADGE, minJobs: DEMO_BADGE.minJobs.toString(), minRateBps: DEMO_BADGE.minRateBps.toString(), minVolume: DEMO_BADGE.minVolume.toString(), unlocked: badgeOk },
      },
      null,
      2,
    ),
  );

  if (!badgeOk) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
