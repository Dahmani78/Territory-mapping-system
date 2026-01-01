"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
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

type PartnerRow = {
  id: string;
  name: string;
  active: boolean | null;
};

type Partner = {
  id: string;
  name: string;
};

type TerritoryRow = {
  id: string;
  name: string | null;
  partner_id: string;
  priority: number;
  geojson: any;
};

type FindResult = {
  partner_id: string;
  partner_name: string;
  territory_id: string;
  territory_name: string;
};

type SelectedTerritory = {
  id: string;
  name: string;
  partner_id: string;
  priority: number;
};

type OverlapRow = {
  other_id: string;
  other_name: string;
  other_partner_id: string;
  other_partner_name: string;
  other_priority: number;
};

type GlobalOverlapRow = {
  t1_id: string;
  t1_name: string;
  t1_partner_id: string;
  t1_partner_name: string;
  t1_priority: number;
  t2_id: string;
  t2_name: string;
  t2_partner_id: string;
  t2_partner_name: string;
  t2_priority: number;
  overlap_area: number;
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

/**
 * Convert GeoJSON (Geometry/Feature/FeatureCollection) to Leaflet polygons,
 * filtering invalid rings/points to avoid leaflet-draw crashes.
 */
function geojsonToLeafletPolygons(geojson: any): L.Polygon[] {
  const polys: L.Polygon[] = [];
  if (!geojson) return polys;

  const addPolygonCoords = (coords: any) => {
    if (!Array.isArray(coords) || coords.length === 0) return;

    const rings = coords
      .map((ring: any) =>
        Array.isArray(ring)
          ? ring
              .filter(
                (pt: any) =>
                  Array.isArray(pt) &&
                  pt.length >= 2 &&
                  pt[0] != null &&
                  pt[1] != null
              )
              .map((pt: any) => [pt[1], pt[0]] as [number, number]) // [lat,lng]
          : []
      )
      .filter((ring: any) => ring.length >= 3);

    if (rings.length === 0) return;

    polys.push(L.polygon(rings as any));
  };

  const geom =
    geojson.type === "Feature"
      ? geojson.geometry
      : geojson.type === "FeatureCollection"
        ? null
        : geojson;

  if (!geom) {
    if (geojson.type === "FeatureCollection" && Array.isArray(geojson.features)) {
      for (const f of geojson.features) {
        geojsonToLeafletPolygons(f).forEach((p) => polys.push(p));
      }
    }
    return polys;
  }

  if (geom.type === "Polygon") {
    addPolygonCoords(geom.coordinates);
  } else if (geom.type === "MultiPolygon") {
    for (const polyCoords of geom.coordinates || []) {
      addPolygonCoords(polyCoords);
    }
  }

  return polys;
}

export default function TerritoryMap() {
  // Expects Supabase RPCs:
  // - find_partner_by_point(lat, lng)
  // - upsert_territory(territory_id, partner_id, name, geom_geojson, priority)
  // - delete_territory(territory_id)
  // - get_overlaps_for_territory(p_territory_id)
  // - list_overlaps()
  // - resolve_overlap_raise_priority(p_territory_id)

  const t = useTranslations("Map");

  const searchParams = useSearchParams();


  const mapRef = useRef<L.Map | null>(null);

  // Leaflet Draw editable group
  const territoriesGroupRef = useRef<L.FeatureGroup | null>(null);

  // Draw plugin init guard
  const drawInitRef = useRef(false);

  // Active partners for drawing dropdown
  const [partnersActive, setPartnersActive] = useState<Partner[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const selectedPartnerIdRef = useRef("");

  // All partners map + list (for reassign UI)
  const [partnersAll, setPartnersAll] = useState<Partner[]>([]);
  const [partnerNameById, setPartnerNameById] = useState<Record<string, string>>(
    {}
  );

  // Territories
  const [territories, setTerritories] = useState<TerritoryRow[]>([]);

  // Modes
  const [mode, setMode] = useState<"quote" | "draw">("quote");
  const modeRef = useRef<"quote" | "draw">("quote");

  // Quote point
  const [quoteLat, setQuoteLat] = useState<number | null>(null);
  const [quoteLng, setQuoteLng] = useState<number | null>(null);
  const [match, setMatch] = useState<FindResult | null>(null);

  // Selection (single-territory actions)
  const [selectedTerritory, setSelectedTerritory] =
    useState<SelectedTerritory | null>(null);
  const selectedLayerRef = useRef<any | null>(null);

  // Rename + priority + partner edit fields
  const [editName, setEditName] = useState("");
  const [editPriority, setEditPriority] = useState<number>(0);
  const [editPartnerId, setEditPartnerId] = useState<string>("");

  // Overlaps (for selected territory)
  const [overlaps, setOverlaps] = useState<OverlapRow[]>([]);
  const [overlapIds, setOverlapIds] = useState<Set<string>>(new Set());

  // Audit global overlaps
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [globalOverlaps, setGlobalOverlaps] = useState<GlobalOverlapRow[]>([]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  useEffect(() => {
    fixLeafletIcon();
  }, []);

  useEffect(() => {
    modeRef.current = mode;
    if (mode !== "draw") clearSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    selectedPartnerIdRef.current = selectedPartnerId;
  }, [selectedPartnerId]);

  useEffect(() => {
    void loadPartners();
    void loadTerritories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

    // 29.10.1 — Lire lat/lng depuis l’URL: /map?lat=..&lng=..&quoteId=..
  useEffect(() => {
    const qLat = searchParams.get("lat");
    const qLng = searchParams.get("lng");

    if (!qLat || !qLng) return;

    const latNum = Number(qLat);
    const lngNum = Number(qLng);

    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return;
    if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) return;

    // Basculer en mode quote + poser le point
    setMode("quote");
    modeRef.current = "quote";

    setQuotePoint(latNum, lngNum);

    // Centrer la carte si prête
    const map = mapRef.current;
    if (map) {
      map.setView([latNum, lngNum], Math.max(map.getZoom(), 10), { animate: true });
    }

    // Optionnel: lancer automatiquement la recherche partenaire
    // (si vous préférez laisser l’utilisateur cliquer "Find partner", commentez)
    void (async () => {
      setLoading(true);
      setErrorMsg(null);

      const { data, error } = await supabase.rpc("find_partner_by_point", {
        lat: latNum,
        lng: lngNum
      });

      setLoading(false);

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      setMatch(data?.[0] ?? null);
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const loadPartners = async () => {
    setErrorMsg(null);

    const { data, error } = await supabase
      .from("partners")
      .select("id,name,active")
      .order("created_at", { ascending: false });

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    const rows = (data ?? []) as PartnerRow[];

    const nameMap: Record<string, string> = {};
    for (const p of rows) nameMap[p.id] = p.name;
    setPartnerNameById(nameMap);

    setPartnersAll(rows.map((p) => ({ id: p.id, name: p.name })));

    const active = rows
      .filter((p) => p.active === true)
      .map((p) => ({ id: p.id, name: p.name }));
    setPartnersActive(active);

    if (!selectedPartnerIdRef.current && active.length > 0) {
      setSelectedPartnerId(active[0].id);
      selectedPartnerIdRef.current = active[0].id;
    }
    if (active.length === 0) {
      setSelectedPartnerId("");
      selectedPartnerIdRef.current = "";
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

    const normalized = (data ?? []).map((row: any) => ({
      ...row,
      geojson: typeof row.geojson === "string" ? JSON.parse(row.geojson) : row.geojson
    }));

    setTerritories(normalized as TerritoryRow[]);
  };

  const loadOverlaps = async (territoryId: string) => {
    setOverlaps([]);
    setOverlapIds(new Set([String(territoryId)]));

    const { data, error } = await supabase.rpc("get_overlaps_for_territory", {
      p_territory_id: territoryId
    });

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    const list = (data ?? []) as OverlapRow[];
    setOverlaps(list);

    const ids = new Set<string>();
    ids.add(String(territoryId));
    for (const r of list) ids.add(String(r.other_id));
    setOverlapIds(ids);
  };

  const loadGlobalOverlaps = async () => {
    setAuditLoading(true);
    setErrorMsg(null);

    const { data, error } = await supabase.rpc("list_overlaps");

    setAuditLoading(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setGlobalOverlaps((data ?? []) as GlobalOverlapRow[]);
  };

  const clearSelection = () => {
    if (selectedLayerRef.current?.setStyle) {
      const meta = selectedLayerRef.current.__territory;
      const id = String(meta?.id ?? "");
      const isOverlap = overlapIds.has(id);
      selectedLayerRef.current.setStyle({
        weight: 2,
        dashArray: isOverlap ? "6 6" : undefined
      });
    }

    selectedLayerRef.current = null;
    setSelectedTerritory(null);

    setEditName("");
    setEditPriority(0);
    setEditPartnerId("");

    setOverlaps([]);
    setOverlapIds(new Set());
  };

  const zoomToLayer = (layer: any) => {
    const map = mapRef.current;
    if (!map || !layer) return;

    try {
      const bounds = layer.getBounds?.();
      if (bounds && bounds.isValid && bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40] });
      }
    } catch {
      // ignore
    }
  };

  const findLayerByTerritoryId = (territoryId: string) => {
    const fg = territoriesGroupRef.current;
    if (!fg) return null;

    let found: any = null;
    fg.eachLayer((lyr: any) => {
      const id = String(lyr?.__territory?.id ?? "");
      if (id === String(territoryId)) found = lyr;
    });
    return found;
  };

  const selectLayer = (layer: any) => {
    if (selectedLayerRef.current?.setStyle) {
      const prevMeta = selectedLayerRef.current.__territory;
      const prevId = String(prevMeta?.id ?? "");
      const prevIsOverlap = overlapIds.has(prevId);
      selectedLayerRef.current.setStyle({
        weight: 2,
        dashArray: prevIsOverlap ? "6 6" : undefined
      });
    }

    selectedLayerRef.current = layer;

    if (layer?.setStyle) {
      layer.setStyle({ weight: 5, dashArray: undefined });
    }

    const meta = layer.__territory;
    if (!meta?.id) {
      setSelectedTerritory(null);
      setEditName("");
      setEditPriority(0);
      setEditPartnerId("");
      setOverlaps([]);
      setOverlapIds(new Set());
      return;
    }

    const selected: SelectedTerritory = {
      id: meta.id,
      name: meta.name ?? "Territory",
      partner_id: meta.partner_id,
      priority: meta.priority ?? 0
    };

    setSelectedTerritory(selected);
    setEditName(selected.name);
    setEditPriority(selected.priority);
    setEditPartnerId(selected.partner_id);

    zoomToLayer(layer);

    void loadOverlaps(selected.id);
  };

  const deleteSelectedTerritory = async () => {
    if (!selectedTerritory) return;

    const ok = window.confirm(t("deleteConfirm"));
    if (!ok) return;

    setErrorMsg(null);
    setInfoMsg(null);

    const { error } = await supabase.rpc("delete_territory", {
      territory_id: selectedTerritory.id
    });

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setInfoMsg(t("deleted"));
    clearSelection();
    await loadTerritories();
    if (auditOpen) await loadGlobalOverlaps();
  };

  const saveSelectedTerritoryMeta = async () => {
    if (!selectedTerritory || !selectedLayerRef.current) return;

    const name = editName.trim();
    if (!name) {
      setErrorMsg(t("nameRequired"));
      return;
    }

    if (!editPartnerId) {
      setErrorMsg(t("partnerRequired"));
      return;
    }

    const priority = Number.isFinite(editPriority) ? editPriority : 0;

    setErrorMsg(null);
    setInfoMsg(null);

    const geom = selectedLayerRef.current.toGeoJSON().geometry;

    const { error } = await supabase.rpc("upsert_territory", {
      territory_id: selectedTerritory.id,
      partner_id: editPartnerId,
      name,
      geom_geojson: geom,
      priority
    });

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    selectedLayerRef.current.__territory = {
      ...selectedLayerRef.current.__territory,
      name,
      priority,
      partner_id: editPartnerId
    };

    setSelectedTerritory((prev) =>
      prev ? { ...prev, name, priority, partner_id: editPartnerId } : prev
    );

    setInfoMsg(t("saved"));
    await loadTerritories();
    await loadOverlaps(selectedTerritory.id);
    if (auditOpen) await loadGlobalOverlaps();
  };

  const resolveSelectedOverlap = async () => {
    if (!selectedTerritory) return;

    setErrorMsg(null);
    setInfoMsg(null);

    const { data, error } = await supabase.rpc("resolve_overlap_raise_priority", {
      p_territory_id: selectedTerritory.id
    });

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    const row = (data?.[0] ?? null) as any;
    if (row) {
      setInfoMsg(
        `${t("priority")}: ${row.old_priority} → ${row.new_priority}`
      );
      setEditPriority(Number(row.new_priority));
    } else {
      setInfoMsg(t("saved"));
    }

    await loadTerritories();
    await loadOverlaps(selectedTerritory.id);
    if (auditOpen) await loadGlobalOverlaps();
  };

  const syncTerritoriesToFeatureGroup = () => {
    const fg = territoriesGroupRef.current;
    if (!fg) return;

    fg.clearLayers();

    territories.forEach((tr) => {
      const polygons = geojsonToLeafletPolygons(tr.geojson);
      polygons.forEach((poly: any) => {
        const id = String(tr.id);
        const isOverlap = overlapIds.has(id);

        poly.setStyle({
          weight: 2,
          dashArray: isOverlap ? "6 6" : undefined
        });

        poly.__territory = {
          id: tr.id,
          name: tr.name ?? "Territory",
          partner_id: tr.partner_id,
          priority: tr.priority ?? 0
        };

        poly.on("click", () => {
          if (modeRef.current !== "draw") return;
          selectLayer(poly);
        });

        fg.addLayer(poly);
      });
    });
  };

  useEffect(() => {
    if (!mapRef.current || !territoriesGroupRef.current) return;
    syncTerritoriesToFeatureGroup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [territories]);

  useEffect(() => {
    if (!mapRef.current || !territoriesGroupRef.current) return;
    syncTerritoriesToFeatureGroup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlapIds]);

  useEffect(() => {
    if (typeof window === "undefined" || drawInitRef.current) return;

    const init = async () => {
      (window as any).L = L;
      await import("leaflet-draw");

      if (!(L as any).Control?.Draw) {
        setErrorMsg("Leaflet Draw failed to load.");
        return;
      }

      drawInitRef.current = true;
      if (mapRef.current) initDraw(mapRef.current);
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initDraw = (map: L.Map) => {
    if (territoriesGroupRef.current) return;

    const fg = new L.FeatureGroup();
    territoriesGroupRef.current = fg;
    map.addLayer(fg);

    const drawControl = new (L as any).Control.Draw({
      position: "topleft",
      draw: {
        polygon: true,
        rectangle: true,
        polyline: false,
        marker: false,
        circle: false,
        circlemarker: false
      },
      edit: {
        featureGroup: fg,
        remove: false
      }
    });

    map.addControl(drawControl);

    syncTerritoriesToFeatureGroup();

    map.on((L as any).Draw.Event.CREATED, async (e: any) => {
      setErrorMsg(null);
      setInfoMsg(null);

      if (modeRef.current !== "draw") return;

      const partnerId = selectedPartnerIdRef.current;
      if (!partnerId) {
        setErrorMsg(t("noActiveMessage"));
        return;
      }

      const layer = e.layer;
      fg.addLayer(layer);

      const geom = layer.toGeoJSON().geometry;
      const name = window.prompt(`${t("rename")} ?`);
      if (!name) {
        fg.removeLayer(layer);
        return;
      }

      const { error } = await supabase.rpc("upsert_territory", {
        territory_id: null,
        partner_id: partnerId,
        name,
        geom_geojson: geom,
        priority: 0
      });

      if (error) {
        setErrorMsg(error.message);
        fg.removeLayer(layer);
        return;
      }

      setInfoMsg("Territory saved.");
      await loadTerritories();
      if (auditOpen) await loadGlobalOverlaps();
    });

    map.on((L as any).Draw.Event.EDITED, async (e: any) => {
      setErrorMsg(null);
      setInfoMsg(null);

      if (modeRef.current !== "draw") return;

      const editedLayers: L.Layer[] = [];
      e.layers.eachLayer((layer: any) => editedLayers.push(layer));

      for (const layer of editedLayers as any[]) {
        const meta = layer.__territory;
        if (!meta?.id) continue;

        const geom = layer.toGeoJSON().geometry;

        const { error } = await supabase.rpc("upsert_territory", {
          territory_id: meta.id,
          partner_id: meta.partner_id,
          name: meta.name,
          geom_geojson: geom,
          priority: meta.priority ?? 0
        });

        if (error) {
          setErrorMsg(error.message);
          return;
        }
      }

      setInfoMsg(t("saved"));
      await loadTerritories();

      if (selectedTerritory?.id) {
        await loadOverlaps(selectedTerritory.id);
      }
      if (auditOpen) await loadGlobalOverlaps();
    });
  };

  const setQuotePoint = (lat: number, lng: number) => {
    setQuoteLat(lat);
    setQuoteLng(lng);
    setMatch(null);
  };

  const findPartner = async () => {
    if (quoteLat == null || quoteLng == null) return;

    setLoading(true);
    setErrorMsg(null);

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

  const selectedPartnerName = useMemo(() => {
    if (!selectedTerritory) return "";
    return partnerNameById[selectedTerritory.partner_id] ?? "(Unknown partner)";
  }, [partnerNameById, selectedTerritory]);

  return (
    <div className="relative h-[calc(100vh-56px)] w-full">
      {/* Partner selector + banner */}
      <div className="absolute top-4 right-4 z-[1000] w-72 space-y-2">
        {partnersActive.length === 0 && (
          <div className="bg-yellow-50 border border-yellow-300 rounded p-3 text-xs">
            <div className="font-semibold">{t("noActiveTitle")}</div>
            <div className="mt-1 opacity-80">{t("noActiveMessage")}</div>
            <Link href="/partners" className="mt-2 inline-block underline font-medium">
              {t("goToPartners")}
            </Link>
          </div>
        )}

        <div className="bg-white border rounded p-3 text-sm">
          <div className="font-semibold mb-2">Active partner</div>
          <select
            className="w-full border rounded px-2 py-1"
            value={selectedPartnerId}
            onChange={(e) => setSelectedPartnerId(e.target.value)}
            disabled={partnersActive.length === 0}
          >
            {partnersActive.length === 0 && <option value="">(No active partners)</option>}
            {partnersActive.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Left panel */}
      <div className="absolute left-14 bottom-16 z-[1000] bg-white border rounded p-3 w-96 text-sm max-h-[75vh] overflow-auto">
        <div className="font-semibold mb-2">{t("quoteTool")}</div>

        <div className="flex gap-2 mb-2 text-xs">
          <button
            className={`border px-2 py-1 rounded ${mode === "quote" ? "font-semibold" : ""}`}
            onClick={() => setMode("quote")}
          >
            {t("quoteMode")}
          </button>
          <button
            className={`border px-2 py-1 rounded ${mode === "draw" ? "font-semibold" : ""}`}
            onClick={() => setMode("draw")}
          >
            {t("drawMode")}
          </button>
        </div>

        <div className="text-xs opacity-70 mb-2">
          {mode === "quote" ? t("clickHint") : t("drawHint")}
        </div>

        {mode === "quote" && (
          <>
            <div className="grid grid-cols-2 gap-2 text-xs mb-2">
              <div>
                <div>{t("lat")}</div>
                <div className="font-mono">{quoteLat?.toFixed(6) ?? "-"}</div>
              </div>
              <div>
                <div>{t("lng")}</div>
                <div className="font-mono">{quoteLng?.toFixed(6) ?? "-"}</div>
              </div>
            </div>

            <button
              className="border rounded px-3 py-1"
              disabled={loading}
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
          </>
        )}

        {mode === "draw" && (
          <div className="mt-3 border-t pt-3 text-xs space-y-3">
            <div className="font-semibold">{t("selection")}</div>

            {!selectedTerritory ? (
              <div className="opacity-70">{t("selectHint")}</div>
            ) : (
              <>
                <div>
                  <div className="opacity-70">{t("currentPartner")}</div>
                  <div className="font-medium">{selectedPartnerName}</div>
                </div>

                <div>
                  <label className="opacity-70 block mb-1">{t("reassignPartner")}</label>
                  <select
                    className="w-full border rounded px-2 py-1 text-sm"
                    value={editPartnerId}
                    onChange={(e) => setEditPartnerId(e.target.value)}
                  >
                    {partnersAll.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="opacity-70 block mb-1">{t("rename")}</label>
                  <input
                    className="w-full border rounded px-2 py-1 text-sm"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="opacity-70 block mb-1">{t("priority")}</label>
                  <input
                    type="number"
                    className="w-full border rounded px-2 py-1 text-sm"
                    value={editPriority}
                    onChange={(e) => setEditPriority(Number(e.target.value))}
                  />
                  <div className="mt-1 opacity-70">{t("priorityHint")}</div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    className="border rounded px-2 py-1"
                    onClick={() => selectedLayerRef.current && zoomToLayer(selectedLayerRef.current)}
                  >
                    {t("zoomTo")}
                  </button>

                  <button className="border rounded px-2 py-1" onClick={clearSelection}>
                    {t("clear")}
                  </button>

                  <button className="border rounded px-2 py-1 font-medium" onClick={saveSelectedTerritoryMeta}>
                    {t("save")}
                  </button>

                  <button className="border rounded px-2 py-1 text-red-600" onClick={deleteSelectedTerritory}>
                    {t("delete")}
                  </button>

                  <button className="border rounded px-2 py-1" onClick={resolveSelectedOverlap}>
                    {t("resolveOverlaps")}
                  </button>
                </div>

                <div className="border-t pt-3">
                  <div className="opacity-70 mb-2">{t("overlapsForSelection")}</div>
                  {overlaps.length === 0 ? (
                    <div className="opacity-70">{t("noOverlaps")}</div>
                  ) : (
                    <ul className="space-y-2">
                      {overlaps.map((o) => (
                        <li key={o.other_id} className="border rounded p-2">
                          <div className="font-medium">{o.other_name}</div>
                          <div className="opacity-70">
                            {o.other_partner_name} · {t("priority")} {o.other_priority}
                          </div>
                          <div className="mt-2 flex gap-2">
                            <button
                              className="border rounded px-2 py-1"
                              onClick={() => {
                                const lyr = findLayerByTerritoryId(o.other_id);
                                if (lyr) selectLayer(lyr);
                              }}
                            >
                              {t("focus")}
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}

            <div className="border-t pt-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold">{t("auditTitle")}</div>
                <button
                  className="underline"
                  onClick={async () => {
                    const next = !auditOpen;
                    setAuditOpen(next);
                    if (next) await loadGlobalOverlaps();
                  }}
                >
                  {auditOpen ? t("hide") : t("show")}
                </button>
              </div>

              {auditOpen && (
                <div className="mt-2">
                  <div className="flex items-center gap-2">
                    <button
                      className="border rounded px-2 py-1"
                      onClick={loadGlobalOverlaps}
                      disabled={auditLoading}
                    >
                      {auditLoading ? t("refreshing") : t("refresh")}
                    </button>
                    <div className="text-xs opacity-70">
                      {globalOverlaps.length ? `${globalOverlaps.length}` : ""}
                    </div>
                  </div>

                  {auditLoading ? (
                    <div className="mt-2 opacity-70">Loading...</div>
                  ) : globalOverlaps.length === 0 ? (
                    <div className="mt-2 opacity-70">{t("noGlobalOverlaps")}</div>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {globalOverlaps.slice(0, 30).map((r) => (
                        <li key={`${r.t1_id}-${r.t2_id}`} className="border rounded p-2">
                          <div className="text-xs opacity-70">
                            overlap area: {Number(r.overlap_area || 0).toFixed(2)}
                          </div>

                          <div className="mt-1">
                            <div className="font-medium">
                              {r.t1_name} ({r.t1_partner_name}) · {t("priority")} {r.t1_priority}
                            </div>
                            <div className="font-medium">
                              {r.t2_name} ({r.t2_partner_name}) · {t("priority")} {r.t2_priority}
                            </div>
                          </div>

                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              className="border rounded px-2 py-1"
                              onClick={() => {
                                const lyr = findLayerByTerritoryId(r.t1_id);
                                if (lyr) selectLayer(lyr);
                              }}
                            >
                              {t("focus")} t1
                            </button>
                            <button
                              className="border rounded px-2 py-1"
                              onClick={() => {
                                const lyr = findLayerByTerritoryId(r.t2_id);
                                if (lyr) selectLayer(lyr);
                              }}
                            >
                              {t("focus")} t2
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {globalOverlaps.length > 30 && (
                    <div className="mt-2 text-xs opacity-70">{t("showingFirst")}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="text-red-600 mt-3 text-xs whitespace-pre-wrap">{errorMsg}</div>
        )}
        {infoMsg && (
          <div className="mt-2 text-xs whitespace-pre-wrap">{infoMsg}</div>
        )}
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
        <ClickToSelect enabled={mode === "quote"} onSelect={setQuotePoint} />
        {quoteLat != null && quoteLng != null && <Marker position={[quoteLat, quoteLng]} />}
      </MapContainer>
    </div>
  );
}
