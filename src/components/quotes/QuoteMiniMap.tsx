"use client";

import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
import { fixLeafletIcon } from "@/lib/leafletIcons";

type Props = {
  lat: number;
  lng: number;
  territoryGeojson?: any | null;
};

function FitToContent({ lat, lng, territoryGeojson }: Props) {
  const map = useMap();

  useEffect(() => {
    const point = L.latLng(lat, lng);

    // Si on a un territoire, fitBounds dessus (avec padding)
    if (territoryGeojson) {
      try {
        const layer = L.geoJSON(territoryGeojson as any);
        const bounds = layer.getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [20, 20] });
          return;
        }
      } catch {
        // ignore
      }
    }

    // Sinon: centre sur le point
    map.setView(point, 12);
  }, [map, lat, lng, territoryGeojson]);

  return null;
}

export default function QuoteMiniMap({ lat, lng, territoryGeojson }: Props) {
  useEffect(() => {
    fixLeafletIcon();
  }, []);

  return (
    <div className="overflow-hidden rounded-xl border bg-white">
      <div className="h-56 w-full">
        <MapContainer
          center={[lat, lng]}
          zoom={12}
          className="h-full w-full"
          zoomControl={false}
          scrollWheelZoom={false}
          dragging={true}
          doubleClickZoom={false}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

          {territoryGeojson ? (
            <GeoJSON
              data={territoryGeojson}
              style={() => ({ weight: 2 })}
            />
          ) : null}

          <Marker position={[lat, lng]} />
          <FitToContent lat={lat} lng={lng} territoryGeojson={territoryGeojson} />
        </MapContainer>
      </div>

      <div className="px-4 py-3 text-xs text-zinc-600">
        <div className="font-mono">
          {lat.toFixed(6)}, {lng.toFixed(6)}
        </div>
      </div>
    </div>
  );
}
