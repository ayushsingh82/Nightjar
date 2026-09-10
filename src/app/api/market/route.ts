// Nightjar — the UI's contract endpoint (plan.md §5).
//
// The compiled contract loads its WASM through Node `fs`, so it cannot live in
// the browser bundle. Circuits therefore run here, in the Node runtime, and the
// dashboards drive them over this route. GET returns the whole snapshot
// (public ledger + each agent's private state); POST applies one action and
// returns the snapshot that resulted.

import { marketSession } from "@/lib/midnight/demo-market";
import type { MarketAction } from "@/lib/midnight/market-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await marketSession();
  return Response.json(await session.snapshot());
}

export async function POST(request: Request) {
  let action: MarketAction;
  try {
    action = (await request.json()) as MarketAction;
  } catch {
    return Response.json({ error: "malformed request body" }, { status: 400 });
  }

  try {
    const session = await marketSession();
    return Response.json(await session.apply(action));
  } catch (err) {
    // Circuit asserts land here verbatim ("only the buyer can release",
    // "escrow not delivered", …) — surface them, do not soften them.
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
