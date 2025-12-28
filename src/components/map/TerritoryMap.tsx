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

  // Map + Draw refs
  const mapRef = useRef<L.Map | null>(null);
  const drawnRef = useRef<L.FeatureGroup | null>(null);
  const drawInitializedRef = useRef(false);

  // Mode handling (avoid stale closures inside Leaflet handlers)
  const [mode, setMode] = useState<"quote" | "draw">("quote");
  const modeRef = useRef<"quote" | "draw">("quote");
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Partner list (used for drawing territories)
  const [partners, setPartners] = useState<Partner[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>("");

  // Territories from DB
  const [territories, setTerritories] = useState<TerritoryRow[]>([]);

  // Global messages
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  // Quote tool state
  const [quoteLat, setQuoteLat] = useState<number | null>(null);
  const [quoteLng, setQuoteLng] = useState<number | null>(null);
  const [finding, setFinding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [match, setMatch] = useState<FindResult | null>(null);
  const [quoteId, setQuoteId] = useState<string | null>(null);

  const setQuotePoint = (lat: number, lng: number) => {
    setQuoteLat(lat);
    setQuoteLng(lng);
    setMatch(null);
    setQuoteId(null);
    setInfoMsg(null);
    setErrorMsg(null);
  };

  const clearQuote = () => {
    setQuoteLat(null);
    setQuoteLng(null);
    setMatch(null);
    setQuoteId(null);
    setInfoMsg(null);
    setErrorMsg(null);
  };

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
    const features: Feature<Geometry>[] = territories.map((tr) => ({
      type: "Feature",
      geometry: tr.geojson,
      properties: {
        id: tr.id,
        name: tr.name ?? "Untitled territory",
        partner_id: tr.partner_id,
        priority: tr.priority
      }
    }));
    return { type: "FeatureCollection", features };
  }, [territories]);

  // Load leaflet-draw safely (leaflet-draw expects window.L)
  useEffect(() => {
    const loadDraw = async () => {
      if (typeof window === "undefined") return;
      if (drawInitializedRef.current) return;

      (window as any).L = L;
      await import("leaflet-draw");

      drawInitializedRef.current = true;

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
    if (drawnRef.current) return;

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

  // Quote tool: find partner
  const findPartnerForPoint = async (lat: number, lng: number) => {
    setErrorMsg(null);
    setInfoMsg(null);
    setQuoteId(null);
    setFinding(true);

    try {
      const { data, error } = await supabase.rpc("find_partner_by_point", {
        lat,
        lng
      });

      if (error) throw new Error(error.message);

      const first = (data?.[0] ?? null) as FindResult | null;
      setMatch(first);

      if (!first) setInfoMsg(t("noMatch"));
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Unexpected error");
      setMatch(null);
    } finally {
      setFinding(false);
    }
  };

  // Quote tool: create quote
  const createQuoteAtPoint = async (lat: number, lng: number) => {
    setErrorMsg(null);
    setInfoMsg(null);
    setCreating(true);

    try {
      const { data, error } = await supabase.rpc("create_quote_and_assign", {
        address: "(from map click)",
        lat,
        lng
      });

      if (error) throw new Error(error.message);

      setQuoteId(String(data));
      setInfoMsg(t("quoteCreated"));
      await findPartnerForPoint(lat, lng);
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Unexpected error");
    } finally {
      setCreating(false);
    }
  };

  const center: [number, number] = [45.0, -95.0];
  const zoom = 4;

  return (
    <div className="relative h-[calc(100vh-57px)] w-full">
      {/* Partner selector (for drawing territories) */}
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
          Draw a polygon/rectangle to save a territory for the selected partner.
        </div>
      </div>

      {/* Quote tool panel moved to bottom-left */}
      <div className="quote-panel absolute left-4 bottom-16 z-[5000] bg-white border rounded px-3 py-2 text-sm w-80">
        <div className="font-semibold">{t("quoteTool")}</div>

        {/* Mode toggle */}
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span className="opacity-70">{t("mode")}:</span>
          <button
            className={`border rounded px-2 py-1 ${
              mode === "quote" ? "font-semibold" : ""
            }`}
            onClick={() => setMode("quote")}
          >
            {t("quoteMode")}
          </button>
          <button
            className={`border rounded px-2 py-1 ${
              mode === "draw" ? "font-semibold" : ""
            }`}
            onClick={() => setMode("draw")}
          >
            {t("drawMode")}
          </button>
        </div>

        <div className="mt-2 text-xs opacity-70">
          {mode === "quote" ? t("clickHint") : t("drawHint")}
        </div>


        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div>
            <div className="opacity-70">{t("lat")}</div>
            <div className="font-mono">{quoteLat?.toFixed(6) ?? "-"}</div>
          </div>
          <div>
            <div className="opacity-70">{t("lng")}</div>
            <div className="font-mono">{quoteLng?.toFixed(6) ?? "-"}</div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="border rounded px-3 py-1.5"
            disabled={
              mode !== "quote" ||
              quoteLat == null ||
              quoteLng == null ||
              finding ||
              creating
            }
            onClick={() => findPartnerForPoint(quoteLat!, quoteLng!)}
          >
            {finding ? t("finding") : t("findPartner")}
          </button>

          <button
            className="border rounded px-3 py-1.5"
            disabled={
              mode !== "quote" ||
              quoteLat == null ||
              quoteLng == null ||
              finding ||
              creating
            }
            onClick={() => createQuoteAtPoint(quoteLat!, quoteLng!)}
          >
            {creating ? t("creating") : t("createQuote")}
          </button>

          <button className="border rounded px-3 py-1.5" onClick={clearQuote}>
            {t("clear")}
          </button>
        </div>

        {match && (
          <div className="mt-3 text-sm">
            <div>
              <span className="opacity-70">{t("assignedPartner")}: </span>
              <span className="font-medium">{match.partner_name}</span>
            </div>
            <div>
              <span className="opacity-70">{t("territory")}: </span>
              <span className="font-medium">{match.territory_name}</span>
            </div>
          </div>
        )}

        {quoteId && (
          <div className="mt-3 text-xs">
            <span className="opacity-70">{t("quoteId")}: </span>
            <span className="font-mono">{quoteId}</span>
          </div>
        )}

        {infoMsg && !match && <div className="mt-3 text-sm">{infoMsg}</div>}
        {errorMsg && <div className="mt-3 text-sm text-red-600">{errorMsg}</div>}
      </div>

      <MapContainer
        center={center}
        zoom={zoom}
        zoomControl={false}
        className="h-full w-full"
        whenReady={(e) => {
          mapRef.current = e.target;
          if (drawInitializedRef.current) initDrawControls(e.target);
        }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Zoom moved to bottom-right */}
        <ZoomControl position="bottomright" />

        {/* Click on empty map: select quote point (only in quote mode) */}
        <ClickToSelect
          enabled={mode === "quote"}
          onSelect={(lat, lng) => setQuotePoint(lat, lng)}
        />

        {/* Marker for selected quote location */}
        {quoteLat != null && quoteLng != null && (
          <Marker position={[quoteLat, quoteLng]} />
        )}

        {/* Territories from DB */}
        {featureCollection.features.length > 0 && (
          <GeoJSON
            data={featureCollection}
            onEachFeature={(feature, layer) => {
              const name = String(feature.properties?.name ?? "Territory");
              layer.bindPopup(name);

              // If user clicks directly on polygon:
              // - in quote mode: place quote point and prevent popup
              // - in draw mode: normal popup behavior
              layer.on("click", (ev: any) => {
                if (modeRef.current !== "quote") return;

                ev?.originalEvent?.preventDefault?.();
                ev?.originalEvent?.stopPropagation?.();

                const latlng = ev?.latlng;
                if (!latlng) return;

                setQuotePoint(latlng.lat, latlng.lng);
              });
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}
