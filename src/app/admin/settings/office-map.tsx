"use client";

import * as React from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const DHAKA: [number, number] = [23.8103, 90.4125];

/**
 * Click (or drag the pin) to set the office location. The circle shows the
 * allowed check-in radius. Map data © OpenStreetMap contributors.
 */
export default function OfficeMap({
  lat,
  lng,
  radius,
  onPick,
}: {
  lat: number | null;
  lng: number | null;
  radius: number;
  onPick: (lat: number, lng: number) => void;
}) {
  const el = React.useRef<HTMLDivElement>(null);
  const map = React.useRef<L.Map | null>(null);
  const pin = React.useRef<L.CircleMarker | null>(null);
  const area = React.useRef<L.Circle | null>(null);
  const pickRef = React.useRef(onPick);
  React.useEffect(() => {
    pickRef.current = onPick;
  }, [onPick]);

  // Create the map once.
  React.useEffect(() => {
    if (!el.current || map.current) return;
    const center: [number, number] = lat !== null && lng !== null ? [lat, lng] : DHAKA;
    const m = L.map(el.current, { center, zoom: lat !== null ? 17 : 12, scrollWheelZoom: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => pickRef.current(round6(e.latlng.lat), round6(e.latlng.lng)));
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      pin.current = null;
      area.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialise once
  }, []);

  // Keep the pin and radius circle in sync with the form.
  React.useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (lat === null || lng === null) {
      pin.current?.remove();
      area.current?.remove();
      pin.current = null;
      area.current = null;
      return;
    }
    const pos: L.LatLngExpression = [lat, lng];
    if (!pin.current) {
      area.current = L.circle(pos, { radius, color: "#1d6fb3", weight: 2, fillOpacity: 0.12 }).addTo(m);
      pin.current = L.circleMarker(pos, { radius: 8, color: "#ffffff", weight: 3, fillColor: "#2e3192", fillOpacity: 1 }).addTo(m);
      m.setView(pos, Math.max(m.getZoom(), 17));
    } else {
      pin.current.setLatLng(pos);
      area.current?.setLatLng(pos).setRadius(radius);
      if (!m.getBounds().contains(pos)) m.panTo(pos);
    }
  }, [lat, lng, radius]);

  return <div ref={el} className="h-80 w-full overflow-hidden rounded-lg border" role="application" aria-label="Office location map" />;
}

function round6(n: number) {
  return Math.round(n * 1e6) / 1e6;
}
