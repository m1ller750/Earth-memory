import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { aiStatus } from "@/lib/ai/provider";
import { executeRows, getDb, getDbDriver } from "@/lib/db/client";

/** GET /api/v1/health: liveness and configuration summary (no secrets). */
export async function GET() {
  try {
    const db = await getDb();
    const [{ n }] = await executeRows<{ n: number }>(db, sql`select count(*)::int as n from records`);
    const ai = await aiStatus();
    return NextResponse.json({ status: "ok", database: { driver: await getDbDriver(), records: n }, ai: { provider: ai.provider, enabled: ai.enabled } });
  } catch (error) {
    return NextResponse.json({ status: "error", message: error instanceof Error ? error.message : "unknown" }, { status: 503 });
  }
}
