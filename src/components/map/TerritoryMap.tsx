"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  GeoJSON,
  MapContainer,
  Marker,
  TileLayer,
  ZoomControl,
  useMapEvents
} from "react-leaflet";
import L from "leaflet";
import { useTranslations } from "next-intl";
import { supabase } from "@/lib/supabaseClient";
import { fixLeafletIcon } from "@/lib/leafletIcons";
import type { Geometry, Feature, FeatureCollection } from "geojson";

type Partner = {
  id: string;
  name: string;
};

type TerritoryRow = {
  id: string;
  name: string | null;
  partner_id: string;
  priority: number;
  geojson: Geometry;
};

type FindResult = {
  partner_id: string;
  partner_name: string;
  territory_id: string;
  territory_name: string;
};

function ClickToSelect({
  enabled,
  onSelect
}: {
  enabled: boolean;
  onSelect: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      if (!enabled) return;
      onSelect(e.latlng.lat, e.latlng.lng);
    }
  });
  return null;
}

export default function TerritoryMap() {
  const t = useTranslations("Map");

  /* =========================
     Refs & state
  ========================= */
  const mapRef = useRef<L.Map | null>(null);
  const drawnRef = useRef<L.FeatureGroup | null>(null);
  const drawInitRef = useRef(false);

  const [partners, setPartners] = useState<Partner[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const selectedPartnerIdRef = useRef("");

  const [territories, setTerritories] = useState<TerritoryRow[]>([]);

  const [mode, setMode] = useState<"quote" | "draw">("quote");
  const modeRef = useRef<"quote" | "draw">("quote");

  const [quoteLat, setQuoteLat] = useState<number | null>(null);
  const [quoteLng, setQuoteLng] = useState<number | null>(null);
  const [match, setMatch] = useState<FindResult | null>(null);
  const [quoteId, setQuoteId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  /* =========================
     Effects
  ========================= */
  useEffect(() => {
    fixLeafletIcon();
  }, []);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    selectedPartnerIdRef.current = selectedPartnerId;
  }, [selectedPartnerId]);

  useEffect(() => {
    loadPartners();
    loadTerritories();
  }, []);

  /* =========================
     Data loaders
  ========================= */
  const loadPartners = async () => {
    const { data, error } = await supabase
      .from("partners")
      .select("id,name,active")
      .eq("active", true)
      .order("created_at", { ascending: false });

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setPartners(data ?? []);

    if (!selectedPartnerIdRef.current && data && data.length > 0) {
      setSelectedPartnerId(data[0].id);
      selectedPartnerIdRef.current = data[0].id;
    }
  };

  const loadTerritories = async () => {
    const { data, error } = await supabase
      .from("v_territories_geojson")
      .select("id,name,partner_id,priority,geojson");

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    // ✅ IMPORTANT: parser geojson si string
    const normalized = (data ?? []).map((row: any) => ({
      ...row,
      geojson:
        typeof row.geojson === "string"
          ? JSON.parse(row.geojson)
          : row.geojson
    }));

    setTerritories(normalized as TerritoryRow[]);
  };

  /* =========================
     GeoJSON memo
  ========================= */
  const featureCollection: FeatureCollection = useMemo(() => {
    const features: Feature<Geometry>[] = territories.map((t) => ({
      type: "Feature",
      geometry: t.geojson,
      properties: {
        id: t.id,
        name: t.name ?? "Territory"
      }
    }));
    return { type: "FeatureCollection", features };
  }, [territories]);

  /* =========================
     Leaflet Draw init
  ========================= */
  useEffect(() => {
    if (typeof window === "undefined" || drawInitRef.current) return;

    (window as any).L = L;
    import("leaflet-draw").then(() => {
      drawInitRef.current = true;
      if (mapRef.current) initDraw(mapRef.current);
    });
  }, []);

  const initDraw = (map: L.Map) => {
    if (drawnRef.current) return;

    const drawnItems = new L.FeatureGroup();
    drawnRef.current = drawnItems;
    map.addLayer(drawnItems);

    const drawControl = new (L as any).Control.Draw({
      draw: {
        polygon: true,
        rectangle: true,
        polyline: false,
        marker: false,
        circle: false,
        circlemarker: false
      },
      edit: {
        featureGroup: drawnItems,
        remove: true
      }
    });

    map.addControl(drawControl);

    map.on((L as any).Draw.Event.CREATED, async (e: any) => {
      const partnerId = selectedPartnerIdRef.current;
      if (!partnerId) {
        setErrorMsg("Please select a partner before drawing a territory.");
        return;
      }

      const layer = e.layer;
      drawnItems.addLayer(layer);

      const geojson = layer.toGeoJSON().geometry;
      const name = window.prompt("Territory name?");
      if (!name) {
        drawnItems.removeLayer(layer);
        return;
      }

      const { error } = await supabase.rpc("upsert_territory", {
        territory_id: null,
        partner_id: partnerId,
        name,
        geom_geojson: geojson,
        priority: 0
      });

      if (error) {
        setErrorMsg(error.message);
        drawnItems.removeLayer(layer);
        return;
      }

      setInfoMsg("Territory saved.");
      drawnItems.clearLayers();
      await loadTerritories(); // ✅ refresh state
    });
  };

  /* =========================
     Quote logic
  ========================= */
  const setQuotePoint = (lat: number, lng: number) => {
    setQuoteLat(lat);
    setQuoteLng(lng);
    setMatch(null);
    setQuoteId(null);
  };

  const findPartner = async () => {
    if (quoteLat == null || quoteLng == null) return;
    setLoading(true);
    const { data, error } = await supabase.rpc("find_partner_by_point", {
      lat: quoteLat,
      lng: quoteLng
    });
    setLoading(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setMatch(data?.[0] ?? null);
  };

  /* =========================
     Render
  ========================= */
  return (
    <div className="relative h-[calc(100vh-56px)] w-full">
      {/* Partner selector */}
      <div className="absolute top-4 right-4 z-[1000] bg-white border rounded p-3 text-sm w-72">
        <div className="font-semibold mb-2">Active partner</div>
        <select
          className="w-full border rounded px-2 py-1"
          value={selectedPartnerId}
          onChange={(e) => setSelectedPartnerId(e.target.value)}
        >
          {partners.length === 0 && <option value="">(No active partners)</option>}
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Quote panel */}
      <div className="absolute left-4 bottom-16 z-[1000] bg-white border rounded p-3 w-80 text-sm">
        <div className="font-semibold mb-2">{t("quoteTool")}</div>

        <div className="flex gap-2 mb-2 text-xs">
          <button
            className={`border px-2 py-1 rounded ${
              mode === "quote" ? "font-semibold" : ""
            }`}
            onClick={() => setMode("quote")}
          >
            {t("quoteMode")}
          </button>
          <button
            className={`border px-2 py-1 rounded ${
              mode === "draw" ? "font-semibold" : ""
            }`}
            onClick={() => setMode("draw")}
          >
            {t("drawMode")}
          </button>
        </div>

        <div className="text-xs opacity-70 mb-2">
          {mode === "quote" ? t("clickHint") : t("drawHint")}
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs mb-2">
          <div>
            <div>Lat</div>
            <div className="font-mono">{quoteLat?.toFixed(6) ?? "-"}</div>
          </div>
          <div>
            <div>Lng</div>
            <div className="font-mono">{quoteLng?.toFixed(6) ?? "-"}</div>
          </div>
        </div>

        <button
          className="border rounded px-3 py-1"
          disabled={loading || mode !== "quote"}
          onClick={findPartner}
        >
          {loading ? t("finding") : t("findPartner")}
        </button>

        {match && (
          <div className="mt-2 text-xs">
            <div>
              {t("assignedPartner")}: <b>{match.partner_name}</b>
            </div>
            <div>
              {t("territory")}: <b>{match.territory_name}</b>
            </div>
          </div>
        )}

        {errorMsg && <div className="text-red-600 mt-2">{errorMsg}</div>}
        {infoMsg && <div className="mt-2">{infoMsg}</div>}
      </div>

      <MapContainer
        center={[45, -95]}
        zoom={4}
        className="h-full w-full"
        zoomControl={false}
        whenReady={(e) => {
          mapRef.current = e.target;
          if (drawInitRef.current) initDraw(e.target);
        }}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <ZoomControl position="bottomright" />

        <ClickToSelect
          enabled={mode === "quote"}
          onSelect={(lat, lng) => setQuotePoint(lat, lng)}
        />

        {quoteLat != null && quoteLng != null && (
          <Marker position={[quoteLat, quoteLng]} />
        )}

        {/* ✅ FORCE redraw with key */}
        <GeoJSON
          key={territories.map((t) => t.id).join(",")}
          data={featureCollection}
        />
      </MapContainer>
    </div>
  );
}
