import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GpsSpeedTest } from "./gps-speed-test";

export const metadata: Metadata = { title: "GPS speed test" };

/**
 * Staging-only diagnostic page: measures how fast and how accurately this
 * device reports its location, and the server round-trip time.
 * Uses no database and stores nothing.
 */
export default function GpsTestPage() {
  if (process.env.VERCEL_ENV === "production") notFound(); // staging / local only
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8">
      <h1 className="text-xl font-semibold tracking-tight">GPS speed test</h1>
      <p className="mt-1 mb-5 text-sm text-muted-foreground">
        Test page only. Nothing is saved and no database is used. Your location is read only when you press the button.
      </p>
      <GpsSpeedTest />
    </main>
  );
}
