import { NextResponse } from "next/server";

/** Tiny endpoint for measuring browser ↔ server round-trip time. No data, no database. */
export function GET() {
  return NextResponse.json(
    { ok: true, region: process.env.VERCEL_REGION ?? "local", at: Date.now() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
