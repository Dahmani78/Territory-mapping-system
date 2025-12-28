"use client";

import { useEffect, useMemo, useState } from "react";
import { GeoJSON, MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import { fixLeafletIcon } from "@/lib/leafletIcons";
import { supabase } from "@/lib/supabaseClient";
import type { Feature, FeatureCollection, Geometry } from "geojson";

type TerritoryRow = {
  id: string;
  name: string | null;
  partner_id: string;
  priority: number;
  geojson: Geometry; // MultiPolygon (as GeoJSON geometry)
};

export default function TerritoryMap() {
  const [territories, setTerritories] = useState<TerritoryRow[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    fixLeafletIcon();
  }, []);

  useEffect(() => {
    const load = async () => {
      setErrorMsg(null);

      const { data, error } = await supabase
        .from("v_territories_geojson")
        .select("id,name,partner_id,priority,geojson");

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      setTerritories((data ?? []) as TerritoryRow[]);
    };

    load();
  }, []);

  const featureCollection: FeatureCollection = useMemo(() => {
    const features: Feature<Geometry>[] = territories
      .filter((t) => !!t.geojson)
      .map((t) => ({
        type: "Feature",
        geometry: t.geojson,
        properties: {
          id: t.id,
          name: t.name ?? "Untitled territory",
          partner_id: t.partner_id,
          priority: t.priority
        }
      }));

    return { type: "FeatureCollection", features };
  }, [territories]);

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

        {/* Sanity marker */}
        <Marker position={[45.5017, -73.5673]}>
          <Popup>Montreal (test)</Popup>
        </Marker>

        {/* Territories */}
        {featureCollection.features.length > 0 && (
          <GeoJSON
            data={featureCollection}
            onEachFeature={(feature, layer) => {
              const name = String(feature.properties?.name ?? "Territory");
              layer.bindPopup(name);
            }}
          />
        )}
      </MapContainer>

      {errorMsg && (
        <div className="absolute left-4 bottom-4 bg-white border rounded px-3 py-2 text-sm">
          Error loading territories: {errorMsg}
        </div>
      )}
    </div>
  );
}
