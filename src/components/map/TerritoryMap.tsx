"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GeoJSON, MapContainer, TileLayer } from "react-leaflet";
import L from "leaflet";
import { fixLeafletIcon } from "@/lib/leafletIcons";
import { supabase } from "@/lib/supabaseClient";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { Partner } from "@/lib/types";

type TerritoryRow = {
  id: string;
  name: string | null;
  partner_id: string;
  priority: number;
  geojson: Geometry;
};

export default function TerritoryMap() {
  const mapRef = useRef<L.Map | null>(null);
  const drawnRef = useRef<L.FeatureGroup | null>(null);
  const drawInitializedRef = useRef(false);

  const [partners, setPartners] = useState<Partner[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>("");
  const [territories, setTerritories] = useState<TerritoryRow[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  useEffect(() => {
    fixLeafletIcon();
  }, []);

  const loadPartners = async () => {
    const { data, error } = await supabase
      .from("partners")
      .select("id,name")
      .order("created_at", { ascending: false });

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    const list = (data ?? []) as Partner[];
    setPartners(list);

    if (!selectedPartnerId && list.length > 0) {
      setSelectedPartnerId(list[0].id);
    }
  };

  const loadTerritories = async () => {
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

  useEffect(() => {
    loadPartners();
    loadTerritories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const featureCollection: FeatureCollection = useMemo(() => {
    const features: Feature<Geometry>[] = territories.map((t) => ({
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

  // Load leaflet-draw safely (requires window.L)
  useEffect(() => {
    const loadDraw = async () => {
      if (typeof window === "undefined") return;
      if (drawInitializedRef.current) return;

      // Expose Leaflet as global for leaflet-draw
      (window as any).L = L;

      await import("leaflet-draw"); // now it can find global L

      drawInitializedRef.current = true;

      // If map already exists, initialize controls now
      if (mapRef.current) {
        initDrawControls(mapRef.current);
      }
    };

    loadDraw().catch((e) => {
      setErrorMsg(e?.message ?? "Failed to load leaflet-draw");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initDrawControls = (map: L.Map) => {
    if (drawnRef.current) return; // already set

    const drawnItems = new L.FeatureGroup();
    drawnRef.current = drawnItems;
    map.addLayer(drawnItems);

    const drawControl = new (L as any).Control.Draw({
      position: "topleft",
      draw: {
        polygon: true,
        rectangle: true,
        circle: false,
        circlemarker: false,
        marker: false,
        polyline: false
      },
      edit: {
        featureGroup: drawnItems,
        remove: true
      }
    });

    map.addControl(drawControl);

    map.on((L as any).Draw.Event.CREATED, async (e: any) => {
      try {
        setInfoMsg(null);
        setErrorMsg(null);

        if (!selectedPartnerId) {
          setErrorMsg("Please select a partner before drawing a territory.");
          return;
        }

        const layer = e.layer as any;
        drawnItems.addLayer(layer);

        const gj = layer.toGeoJSON();
        const geometry = gj.geometry;

        const territoryName = window.prompt("Territory name?", "New territory");
        if (!territoryName) return;

        const { error } = await supabase.rpc("upsert_territory", {
          territory_id: null,
          partner_id: selectedPartnerId,
          name: territoryName,
          geom_geojson: geometry,
          priority: 0
        });

        if (error) {
          setErrorMsg(error.message);
          return;
        }

        setInfoMsg("Territory saved.");
        await loadTerritories();
        drawnItems.clearLayers();
      } catch (err: any) {
        setErrorMsg(err?.message ?? "Unexpected error");
      }
    });
  };

  const center: [number, number] = [45.0, -95.0];
  const zoom = 4;

  return (
    <div className="relative h-[calc(100vh-57px)] w-full">
      <div className="absolute right-4 top-4 z-[1000] bg-white border rounded px-3 py-2 text-sm w-72">
        <div className="font-semibold">Active partner</div>
        <select
          className="mt-2 w-full border rounded px-2 py-1"
          value={selectedPartnerId}
          onChange={(e) => setSelectedPartnerId(e.target.value)}
        >
          {partners.length === 0 && <option value="">(No partners)</option>}
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <div className="mt-2 text-xs opacity-70">
          Draw a polygon/rectangle, then save it to the selected partner.
        </div>

        {infoMsg && <div className="mt-2 text-xs">{infoMsg}</div>}
        {errorMsg && <div className="mt-2 text-xs text-red-600">{errorMsg}</div>}
      </div>

      <MapContainer
        center={center}
        zoom={zoom}
        className="h-full w-full"
        whenReady={(e) => {
          mapRef.current = e.target;

          // If leaflet-draw is already loaded, init immediately
          if (drawInitializedRef.current) {
            initDrawControls(e.target);
          }
        }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

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
    </div>
  );
}
