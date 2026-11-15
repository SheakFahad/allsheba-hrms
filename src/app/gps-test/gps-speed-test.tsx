"use client";

import * as React from "react";
import { Loader2, LocateFixed, MapPin, RotateCcw, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/shared/field";
import { cn } from "@/lib/utils";

interface Reading {
  firstFixMs: number;
  firstAccuracy: number;
  bestAccuracy: number;
  bestAtMs: number;
  reachedTargetMs: number | null;
  lat: number;
  lng: number;
  samples: number;
}

const TARGET_ACCURACY = 50; // metres (default "required accuracy" in Office & GPS settings)

function distanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

/** Same capture logic as the real Check In button: watch ≤10 s, stop at target accuracy. */
function measure(maxWaitMs = 10000): Promise<Reading> {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    let first: { ms: number; acc: number } | null = null;
    let best: { acc: number; ms: number; lat: number; lng: number } | null = null;
    let reached: number | null = null;
    let samples = 0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      navigator.geolocation.clearWatch(id);
      clearTimeout(timer);
      if (!first || !best) return reject({ code: 3 });
      resolve({
        firstFixMs: first.ms, firstAccuracy: first.acc, bestAccuracy: best.acc, bestAtMs: best.ms,
        reachedTargetMs: reached, lat: best.lat, lng: best.lng, samples,
      });
    };
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const ms = Math.round(performance.now() - t0);
        samples++;
        if (!first) first = { ms, acc: p.coords.accuracy };
        if (!best || p.coords.accuracy < best.acc) best = { acc: p.coords.accuracy, ms, lat: p.coords.latitude, lng: p.coords.longitude };
        if (p.coords.accuracy <= TARGET_ACCURACY) {
          reached = ms;
          finish();
        }
      },
      (err) => {
        if (best) finish();
        else {
          done = true;
          navigator.geolocation.clearWatch(id);
          clearTimeout(timer);
          reject(err);
        }
      },
      { enableHighAccuracy: true, timeout: maxWaitMs + 5000, maximumAge: 0 },
    );
    const timer = setTimeout(finish, maxWaitMs);
  });
}

export function GpsSpeedTest() {
  const [busy, setBusy] = React.useState(false);
  const [reading, setReading] = React.useState<Reading | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [ping, setPing] = React.useState<{ ms: number; region: string }[] | null>(null);
  const [office, setOffice] = React.useState<{ lat: string; lng: string }>({ lat: "", lng: "" });

  async function testLocation() {
    setError(null);
    setReading(null);
    if (!window.isSecureContext || !("geolocation" in navigator)) {
      setError("Unable to detect your current location. Please try again. (This browser/page cannot use location.)");
      return;
    }
    setBusy(true);
    try {
      setReading(await measure());
    } catch (e) {
      const code = (e as GeolocationPositionError)?.code;
      setError(code === 1 ? "Location permission is required for attendance." : "Unable to detect your current location. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function testServer() {
    const out: { ms: number; region: string }[] = [];
    for (let i = 0; i < 5; i++) {
      const t = performance.now();
      const r = await fetch(`/api/ping?i=${i}&t=${Date.now()}`, { cache: "no-store" });
      const j = (await r.json()) as { region: string };
      out.push({ ms: Math.round(performance.now() - t), region: j.region });
    }
    setPing(out);
  }

  const officeLat = Number(office.lat);
  const officeLng = Number(office.lng);
  const haveOffice = office.lat !== "" && office.lng !== "" && Number.isFinite(officeLat) && Number.isFinite(officeLng);
  const dist = reading && haveOffice ? distanceM(reading.lat, reading.lng, officeLat, officeLng) : null;
  const sec = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
  const pingSorted = ping ? [...ping].map((p) => p.ms).sort((a, b) => a - b) : null;

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="grid gap-4">
          <Button size="lg" className="h-14 text-base" onClick={testLocation} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <LocateFixed />} {busy ? "Detecting your current location..." : "Test my location"}
          </Button>

          {error && <p className="text-sm font-medium text-danger">{error}</p>}

          {reading && (
            <div className="grid gap-2">
              <Row label="Time to first location" value={sec(reading.firstFixMs)} good={reading.firstFixMs <= 3000} />
              <Row label="First accuracy" value={`±${Math.round(reading.firstAccuracy)} m`} good={reading.firstAccuracy <= TARGET_ACCURACY} />
              <Row
                label={`Reached ±${TARGET_ACCURACY} m accuracy`}
                value={reading.reachedTargetMs !== null ? `yes, after ${sec(reading.reachedTargetMs)}` : "no (within 10 s)"}
                good={reading.reachedTargetMs !== null}
              />
              <Row label="Best accuracy" value={`±${Math.round(reading.bestAccuracy)} m (at ${sec(reading.bestAtMs)})`} good={reading.bestAccuracy <= TARGET_ACCURACY} />
              <p className="text-xs text-muted-foreground">
                {reading.samples} reading(s). Location reading stopped after this test.
                {reading.reachedTargetMs !== null
                  ? " A real Check In would continue immediately."
                  : " A real Check In would show “Location accuracy is insufficient. Please try again.”"}
              </p>
              <Button variant="outline" size="sm" className="w-fit" onClick={testLocation}><RotateCcw /> Test again</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-3">
          <p className="flex items-center gap-2 text-sm font-semibold"><MapPin className="size-4 text-brand" /> Optional: distance to the office</p>
          <p className="text-xs text-muted-foreground">
            Standing in the office? Run the test, then press “Use this as office”. Walk away and test again to see the distance.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Office latitude" htmlFor="olat"><Input id="olat" inputMode="decimal" value={office.lat} onChange={(e) => setOffice({ ...office, lat: e.target.value })} /></Field>
            <Field label="Office longitude" htmlFor="olng"><Input id="olng" inputMode="decimal" value={office.lng} onChange={(e) => setOffice({ ...office, lng: e.target.value })} /></Field>
          </div>
          <Button variant="outline" size="sm" className="w-fit" disabled={!reading} onClick={() => reading && setOffice({ lat: reading.lat.toFixed(6), lng: reading.lng.toFixed(6) })}>
            Use this as office
          </Button>
          {dist !== null && reading && (
            // Same order as the server: accuracy first, then distance.
            reading.bestAccuracy > TARGET_ACCURACY ? (
              <p className="text-sm font-medium text-danger">
                {Math.round(dist)} m from the office, but accuracy is ±{Math.round(reading.bestAccuracy)} m (limit ±{TARGET_ACCURACY} m) —
                Check In would be rejected: “Location accuracy is insufficient. Please try again.”
              </p>
            ) : (
              <p className={cn("text-sm font-medium", dist <= 100 ? "text-success" : "text-danger")}>
                {Math.round(dist)} m from the office —{" "}
                {dist <= 100 ? "inside 100 m: Check In would be accepted." : "You are outside the authorized office location."}
              </p>
            )
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-3">
          <Button variant="outline" onClick={testServer}><Server /> Test server speed (5 requests)</Button>
          {pingSorted && ping && (
            <div className="grid gap-1 text-sm">
              <Row label="Fastest" value={`${pingSorted[0]} ms`} good={pingSorted[0] <= 400} />
              <Row label="Typical (median)" value={`${pingSorted[2]} ms`} good={pingSorted[2] <= 500} />
              <Row label="Slowest" value={`${pingSorted[4]} ms`} good={pingSorted[4] <= 1000} />
              <p className="text-xs text-muted-foreground">Server region: {ping[0].region}. The first request can be slower (server waking up).</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tabular font-semibold", good ? "text-success" : "text-warning")}>{value}</span>
    </div>
  );
}
