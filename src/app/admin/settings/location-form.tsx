"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Crosshair, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/shared/field";
import type { CompanySettings } from "@/lib/types";
import { saveSettings } from "../system-actions";

const OfficeMap = dynamic(() => import("./office-map"), {
  ssr: false,
  loading: () => <div className="h-80 w-full animate-pulse rounded-lg bg-muted" />,
});

/**
 * Office location & GPS rules for employee self check-in. The admin can change
 * these from anywhere — no location check applies to administrators.
 */
export function LocationForm({ s }: { s: CompanySettings }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [locating, setLocating] = React.useState(false);
  const [v, setV] = React.useState({
    office_name: s.office_name ?? "",
    office_address: s.office_address ?? "",
    office_latitude: s.office_latitude === null ? "" : String(s.office_latitude),
    office_longitude: s.office_longitude === null ? "" : String(s.office_longitude),
    office_radius_m: String(s.office_radius_m ?? 100),
    gps_max_accuracy_m: String(s.gps_max_accuracy_m ?? 50),
    self_grace_minutes: String(s.self_grace_minutes ?? 15),
    gps_required: s.gps_required ?? true,
    self_service_enabled: s.self_service_enabled ?? true,
  });
  const lat = v.office_latitude === "" ? null : Number(v.office_latitude);
  const lng = v.office_longitude === "" ? null : Number(v.office_longitude);
  const validPoint = lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng);
  const radius = Math.max(10, Number(v.office_radius_m) || 100);

  const pick = React.useCallback((la: number, ln: number) => {
    setV((x) => ({ ...x, office_latitude: String(la), office_longitude: String(ln) }));
  }, []);

  function useMyLocation() {
    if (!("geolocation" in navigator)) return void toast.error("This browser cannot share location.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        pick(Math.round(p.coords.latitude * 1e6) / 1e6, Math.round(p.coords.longitude * 1e6) / 1e6);
        toast.success(`Location set (accuracy ±${Math.round(p.coords.accuracy)} m). Check the pin and save.`);
      },
      () => {
        setLocating(false);
        toast.error("Could not read your location. Click the office on the map instead.");
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await saveSettings({ section: "location", values: v });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Office location saved. It applies to future check-ins only.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Office location & GPS check-in</CardTitle>
        <CardDescription>
          Employees with their own login can check in / out from their phone or PC only inside this area. Administrators are never
          location-restricted. Changes apply to future check-ins; past attendance is not modified.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-start gap-3 rounded-lg border p-3">
              <Switch checked={v.self_service_enabled} onCheckedChange={(c) => setV({ ...v, self_service_enabled: c })} className="mt-0.5" />
              <span><span className="block text-sm font-medium">Employee self check-in</span><span className="block text-xs text-muted-foreground">Allow employees with a login to check in / out themselves.</span></span>
            </label>
            <label className="flex items-start gap-3 rounded-lg border p-3">
              <Switch checked={v.gps_required} onCheckedChange={(c) => setV({ ...v, gps_required: c })} className="mt-0.5" />
              <span><span className="block text-sm font-medium">Require GPS verification</span><span className="block text-xs text-muted-foreground">When off, self check-ins are saved without location and marked “not GPS-verified”.</span></span>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Office name" htmlFor="o_name"><Input id="o_name" value={v.office_name} onChange={(e) => setV({ ...v, office_name: e.target.value })} placeholder="Head Office" /></Field>
            <Field label="Office address" htmlFor="o_addr"><Textarea id="o_addr" rows={1} value={v.office_address} onChange={(e) => setV({ ...v, office_address: e.target.value })} /></Field>
          </div>

          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Click the map to place the office pin</p>
              <Button type="button" variant="outline" size="sm" onClick={useMyLocation} disabled={locating}>
                {locating ? <Loader2 className="animate-spin" /> : <Crosshair />} Use my current location
              </Button>
            </div>
            <OfficeMap lat={validPoint ? lat : null} lng={validPoint ? lng : null} radius={radius} onPick={pick} />
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Latitude" htmlFor="o_lat"><Input id="o_lat" inputMode="decimal" value={v.office_latitude} onChange={(e) => setV({ ...v, office_latitude: e.target.value })} placeholder="23.780887" /></Field>
            <Field label="Longitude" htmlFor="o_lng"><Input id="o_lng" inputMode="decimal" value={v.office_longitude} onChange={(e) => setV({ ...v, office_longitude: e.target.value })} placeholder="90.407249" /></Field>
            <Field label="Allowed radius (m)" htmlFor="o_rad" hint="Default 100 m"><Input id="o_rad" type="number" min={10} max={5000} value={v.office_radius_m} onChange={(e) => setV({ ...v, office_radius_m: e.target.value })} /></Field>
            <Field label="Required accuracy (m)" htmlFor="o_acc" hint="Reject readings less precise than this"><Input id="o_acc" type="number" min={5} max={1000} value={v.gps_max_accuracy_m} onChange={(e) => setV({ ...v, gps_max_accuracy_m: e.target.value })} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Late after (minutes)" htmlFor="o_grace" hint="Employee self check-in is not late until this many minutes after the shift start">
              <Input id="o_grace" type="number" min={0} max={120} value={v.self_grace_minutes} onChange={(e) => setV({ ...v, self_grace_minutes: e.target.value })} />
            </Field>
          </div>

          <div className="flex justify-end border-t pt-4">
            <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Save />} Save location settings</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
