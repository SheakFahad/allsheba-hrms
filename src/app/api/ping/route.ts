import { NextResponse } from "next/server";

/** Tiny endpoint for measuring browser ↔ server round-trip time. No data, no database. */
export function GET() {
  if (process.env.VERCEL_ENV === "production") return new NextResponse(null, { status: 404 }); // staging / local only
  return NextResponse.json(
    { ok: true, region: process.env.VERCEL_REGION ?? "local", at: Date.now() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
