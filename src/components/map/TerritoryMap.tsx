"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { fixLeafletIcon } from "@/lib/leafletIcons";

export default function TerritoryMap() {
  useEffect(() => {
    fixLeafletIcon();
  }, []);

  // Center roughly between US/Canada
  const center: [number, number] = [45.0, -95.0];
  const zoom = 4;

  return (
    <div className="h-[calc(100vh-57px)] w-full">
      <MapContainer center={center} zoom={zoom} className="h-full w-full">
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Temporary marker for sanity check */}
        <Marker position={[45.5017, -73.5673]}>
          <Popup>Montreal (test)</Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
