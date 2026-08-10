import { NextResponse, type NextRequest } from "next/server";
import { logError } from "@/lib/error-log";
import { runProcessingOrderExpiryWatchdog } from "@/lib/watchdogs";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const expiry = await runProcessingOrderExpiryWatchdog();
    return NextResponse.json({ ok: true, expiry, ranAt: new Date().toISOString() });
  } catch (error) {
    await logError({ error, source: "cron:processing", severity: "ERROR" });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
