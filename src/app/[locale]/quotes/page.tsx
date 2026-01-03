"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { supabase } from "@/lib/supabaseClient";
import { isAdmin } from "@/lib/authRole";

type PartnerOption = { id: string; name: string };

type AssignmentRow = {
  territory_id: string;
  territory_name: string;
  assigned_partner_id: string;
  partner_name: string;
  priority: number;
};

type CreatedQuoteRow = {
  quote_id: string;
  status: "assigned" | "unassigned";
  reason: string | null;
  territory_id: string | null;
  territory_name: string | null;
  assigned_partner_id: string | null;
  partner_name: string | null;
};

type QuoteListRow = {
  id: string;
  created_at: string;
  address: string | null;
  lat: number;
  lng: number;
  status: "assigned" | "unassigned";
  reason: string | null;
  assigned_partner_id: string | null;
  partner_name: string | null;
  territory_id: string | null;
  territory_name: string | null;
};

const PAGE_SIZE = 20;
const EXPORT_CHUNK = 1000;
const EXPORT_MAX = 20000;

function csvEscape(v: any) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function QuotesPage() {
  const t = useTranslations("Quotes");
  const c = useTranslations("Common");
  const tl = useTranslations("QuotesList");

  // Admin UI (for delete visibility)
  const [admin, setAdmin] = useState(false);

  // Create form
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState<string>("");
  const [lng, setLng] = useState<string>("");

  const [geocoding, setGeocoding] = useState(false);
  const [finding, setFinding] = useState(false);
  const [creating, setCreating] = useState(false);

  const [geocodeDisplay, setGeocodeDisplay] = useState<string | null>(null);
  const [assignment, setAssignment] = useState<AssignmentRow | null>(null);
  const [created, setCreated] = useState<CreatedQuoteRow | null>(null);

  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "assigned" | "unassigned">("all");
  const [partnerFilter, setPartnerFilter] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>(""); // yyyy-mm-dd
  const [toDate, setToDate] = useState<string>(""); // yyyy-mm-dd

  // List + pagination
  const [rows, setRows] = useState<QuoteListRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  // Export
  const [exporting, setExporting] = useState(false);

  const resetResult = () => {
    setErrorMsg(null);
    setInfoMsg(null);
    setAssignment(null);
    setCreated(null);
  };

  const parseLatLng = () => {
    const latNum = Number(lat);
    const lngNum = Number(lng);

    if (!Number.isFinite(latNum) || latNum < -90 || latNum > 90) {
      throw new Error("Invalid latitude");
    }
    if (!Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180) {
      throw new Error("Invalid longitude");
    }
    return { latNum, lngNum };
  };

  const loadPartners = async () => {
    const { data, error } = await supabase
      .from("partners")
      .select("id,name")
      .order("name", { ascending: true });

    if (error) return;
    setPartners((data ?? []) as PartnerOption[]);
  };

  const buildListQuery = () => {
    let q = supabase
      .from("v_quotes_list")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    if (statusFilter !== "all") q = q.eq("status", statusFilter);
    if (partnerFilter !== "all") q = q.eq("assigned_partner_id", partnerFilter);

    if (fromDate) q = q.gte("created_at", `${fromDate}T00:00:00.000Z`);
    if (toDate) q = q.lte("created_at", `${toDate}T23:59:59.999Z`);

    return q;
  };

  const loadQuotes = async (reset = true) => {
    setListLoading(true);
    setErrorMsg(null);

    try {
      const offset = reset ? 0 : rows.length;
      const from = offset;
      const to = offset + PAGE_SIZE - 1;

      const { data, error, count } = await buildListQuery().range(from, to);

      if (error) throw new Error(error.message);

      const next = (data ?? []) as QuoteListRow[];
      const merged = reset ? next : [...rows, ...next];

      setRows(merged);

      const total = typeof count === "number" ? count : merged.length;
      setHasMore(merged.length < total);
    } catch (e: any) {
      setErrorMsg(`${c("errorPrefix")}: ${e?.message ?? "Unexpected error"}`);
    } finally {
      setListLoading(false);
    }
  };

  const clearFilters = () => {
    setStatusFilter("all");
    setPartnerFilter("all");
    setFromDate("");
    setToDate("");
  };

  useEffect(() => {
    (async () => {
      try {
        setAdmin(await isAdmin());
      } catch {
        setAdmin(false);
      }
      await loadPartners();
      await loadQuotes(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload list when filters change
  useEffect(() => {
    void loadQuotes(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, partnerFilter, fromDate, toDate]);

  const geocodeAddress = async () => {
    resetResult();
    setGeocodeDisplay(null);

    const q = address.trim();
    if (!q) {
      setErrorMsg(`${c("errorPrefix")}: Missing address`);
      return;
    }

    setGeocoding(true);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const json = await res.json();

      if (!res.ok) throw new Error(json?.error ?? "Geocoding error");

      if (!json.found) {
        setInfoMsg(t("noMatch"));
        return;
      }

      setLat(String(json.lat));
      setLng(String(json.lng));
      setGeocodeDisplay(String(json.displayName ?? ""));
    } catch (e: any) {
      setErrorMsg(`${c("errorPrefix")}: ${e?.message ?? "Unexpected error"}`);
    } finally {
      setGeocoding(false);
    }
  };

  const findAssignment = async () => {
    resetResult();

    setFinding(true);
    try {
      const { latNum, lngNum } = parseLatLng();

      const { data, error } = await supabase.rpc("find_assignment_by_point", {
        lat: latNum,
        lng: lngNum
      });

      if (error) throw new Error(error.message);

      const first = (data?.[0] ?? null) as AssignmentRow | null;
      setAssignment(first);

      if (!first) setInfoMsg(t("noMatch"));
    } catch (e: any) {
      setErrorMsg(`${c("errorPrefix")}: ${e?.message ?? "Unexpected error"}`);
    } finally {
      setFinding(false);
    }
  };

  const createQuote = async () => {
    resetResult();

    setCreating(true);
    try {
      const { latNum, lngNum } = parseLatLng();

      const { data, error } = await supabase.rpc("create_quote", {
        p_address: address.trim() || null,
        p_lat: latNum,
        p_lng: lngNum
      });

      if (error) throw new Error(error.message);

      const row = (data?.[0] ?? null) as CreatedQuoteRow | null;
      setCreated(row);

      if (!row) {
        setInfoMsg(t("noMatch"));
        return;
      }
      if (row.status === "unassigned") setInfoMsg(t("noMatch"));

      await loadQuotes(true);
    } catch (e: any) {
      setErrorMsg(`${c("errorPrefix")}: ${e?.message ?? "Unexpected error"}`);
    } finally {
      setCreating(false);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    setErrorMsg(null);

    try {
      const all: QuoteListRow[] = [];
      for (let offset = 0; offset < EXPORT_MAX; offset += EXPORT_CHUNK) {
        const { data, error } = await buildListQuery().range(offset, offset + EXPORT_CHUNK - 1);
        if (error) throw new Error(error.message);

        const chunk = (data ?? []) as QuoteListRow[];
        all.push(...chunk);
        if (chunk.length < EXPORT_CHUNK) break;
      }

      const header = [
        "id",
        "created_at",
        "status",
        "reason",
        "address",
        "lat",
        "lng",
        "assigned_partner_id",
        "partner_name",
        "territory_id",
        "territory_name"
      ].join(",");

      const lines = all.map((r) =>
        [
          csvEscape(r.id),
          csvEscape(r.created_at),
          csvEscape(r.status),
          csvEscape(r.reason ?? ""),
          csvEscape(r.address ?? ""),
          csvEscape(r.lat),
          csvEscape(r.lng),
          csvEscape(r.assigned_partner_id ?? ""),
          csvEscape(r.partner_name ?? ""),
          csvEscape(r.territory_id ?? ""),
          csvEscape(r.territory_name ?? "")
        ].join(",")
      );

      const csv = [header, ...lines].join("\n");

      const fnameParts = [
        "quotes",
        statusFilter !== "all" ? statusFilter : "all",
        partnerFilter !== "all" ? "partner" : "allpartners",
        fromDate || "start",
        toDate || "end"
      ];
      const filename = `${fnameParts.join("_")}.csv`;

      downloadTextFile(filename, csv);
    } catch (e: any) {
      setErrorMsg(`${c("errorPrefix")}: ${e?.message ?? "Unexpected error"}`);
    } finally {
      setExporting(false);
    }
  };

  const deleteQuote = async (id: string) => {
    if (!confirm(tl("confirmDelete"))) return;

    setErrorMsg(null);
    try {
      const { error } = await supabase.from("quotes").delete().eq("id", id);
      if (error) throw new Error(error.message);

      await loadQuotes(true);
    } catch (e: any) {
      setErrorMsg(`${c("errorPrefix")}: ${e?.message ?? "Unexpected error"}`);
    }
  };

  const partnerOptions = useMemo(() => partners, [partners]);

  return (
    <main className="mx-auto p-6 max-w-6xl">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <p className="mt-2 text-sm opacity-80">{t("subtitle")}</p>

      {errorMsg && <div className="alert alert-error mt-4">{errorMsg}</div>}
      {infoMsg && !errorMsg && <div className="alert alert-info mt-4">{infoMsg}</div>}

      {/* CREATE */}
      <section className="mt-6 card overflow-hidden">
        <div className="card-header">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="card-title">{tl("createTitle")}</div>
              <span className="badge">Draft</span>
            </div>
            <div className="card-subtitle">
              Paste an address or coordinates, then assign or create a quote.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn btn-secondary"
              onClick={geocodeAddress}
              disabled={geocoding || finding || creating}
            >
              {geocoding ? t("geocoding") : t("geocodeButton")}
            </button>

            <button
              className="btn btn-secondary"
              onClick={findAssignment}
              disabled={finding || creating || geocoding}
            >
              {finding ? t("finding") : t("findButton")}
            </button>

            <button
              className="btn btn-primary"
              onClick={createQuote}
              disabled={finding || creating || geocoding}
            >
              {creating ? t("creating") : t("createButton")}
            </button>
          </div>
        </div>

        <div className="card-body bg-zinc-50/40">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3">
              <div className="flex items-baseline justify-between">
                <label className="label">{t("addressLabel")}</label>
                <span className="help">Recommended</span>
              </div>

              <div className="mt-2">
                <input
                  className="input"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={t("addressPlaceholder")}
                />
              </div>

              {geocodeDisplay && (
                <div className="mt-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm">
                  <span className="text-zinc-500">{t("geocodeResult")}: </span>
                  <span className="font-medium">{geocodeDisplay}</span>
                </div>
              )}

              <div className="mt-3 help">
                Tip: Paste a full address and click “Geocode address”.
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="flex items-baseline justify-between">
                <div className="label">{t("coordsLabel")}</div>
                <span className="help">Optional</span>
              </div>

              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
                <div>
                  <label className="help">{t("latLabel")}</label>
                  <input
                    className="input mt-1"
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    inputMode="decimal"
                    placeholder="45.5017"
                  />
                </div>

                <div>
                  <label className="help">{t("lngLabel")}</label>
                  <input
                    className="input mt-1"
                    value={lng}
                    onChange={(e) => setLng(e.target.value)}
                    inputMode="decimal"
                    placeholder="-73.5673"
                  />
                </div>
              </div>

              <div className="mt-3 help">
                Tip: Use decimal degrees (lat: -90..90, lng: -180..180).
              </div>
            </div>
          </div>

          {(assignment || created) && (
            <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="font-semibold">{t("resultTitle")}</div>

                {created?.status && (
                  <span
                    className={
                      created.status === "assigned"
                        ? "badge badge-green"
                        : "badge badge-yellow"
                    }
                  >
                    {created.status === "assigned" ? tl("assigned") : tl("unassigned")}
                  </span>
                )}
              </div>

              {assignment && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl border border-zinc-200 p-3">
                    <div className="help">{t("assignedPartner")}</div>
                    <div className="font-medium">{assignment.partner_name}</div>
                  </div>

                  <div className="rounded-xl border border-zinc-200 p-3">
                    <div className="help">{t("territory")}</div>
                    <div className="font-medium">{assignment.territory_name}</div>
                    <div className="help mt-1">(priority {assignment.priority})</div>
                  </div>
                </div>
              )}

              {created && (
                <div className="mt-3 space-y-3 text-sm">
                  <div className="rounded-xl border border-zinc-200 p-3">
                    <div className="help">{t("quoteId")}</div>
                    <div className="font-mono">{created.quote_id}</div>

                    {created.reason ? (
                      <div className="mt-2">
                        <span className="opacity-70">{tl("reason")}: </span>
                        <span className="font-mono">{created.reason}</span>
                      </div>
                    ) : null}
                  </div>

                  {created.partner_name && created.territory_name ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-xl border border-zinc-200 p-3">
                        <div className="help">{t("assignedPartner")}</div>
                        <div className="font-medium">{created.partner_name}</div>
                      </div>
                      <div className="rounded-xl border border-zinc-200 p-3">
                        <div className="help">{t("territory")}</div>
                        <div className="font-medium">{created.territory_name}</div>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* LIST + FILTERS */}
      <section className="mt-6 card">
        <div className="card-header">
          <div>
            <div className="card-title">{tl("listTitle")}</div>
            <div className="card-subtitle">{tl("listSubtitle")}</div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="btn btn-secondary" onClick={clearFilters}>
              {tl("clearFilters")}
            </button>
            <button
              className="btn btn-secondary"
              onClick={exportCsv}
              disabled={exporting || listLoading}
            >
              {exporting ? tl("exporting") : tl("exportCsv")}
            </button>
          </div>
        </div>

        <div className="card-body">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">{tl("statusFilter")}</label>
              <select
                className="input"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
              >
                <option value="all">{tl("all")}</option>
                <option value="assigned">{tl("assigned")}</option>
                <option value="unassigned">{tl("unassigned")}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-zinc-500 mb-1">{tl("partnerFilter")}</label>
              <select
                className="input"
                value={partnerFilter}
                onChange={(e) => setPartnerFilter(e.target.value)}
              >
                <option value="all">{tl("all")}</option>
                {partnerOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-zinc-500 mb-1">{tl("from")}</label>
              <input
                type="date"
                className="input"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-500 mb-1">{tl("to")}</label>
              <input
                type="date"
                className="input"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-4">
            {listLoading && rows.length === 0 ? (
              <div className="text-sm text-zinc-500">{tl("loading")}</div>
            ) : rows.length === 0 ? (
              <div className="text-sm text-zinc-500">{tl("noQuotes")}</div>
            ) : (
              <div className="overflow-auto rounded-xl border border-zinc-200">
                <table className="table">
                  <thead className="bg-zinc-50">
                    <tr>
                      <th className="pl-4">{tl("created")}</th>
                      <th>{tl("status")}</th>
                      <th>{tl("partner")}</th>
                      <th>{tl("territory")}</th>
                      <th>{tl("address")}</th>
                      <th>{tl("coords")}</th>
                      <th>{tl("reason")}</th>
                      <th className="pr-4">{tl("actions")}</th>
                    </tr>
                  </thead>

                  <tbody>
                    {rows.map((r, idx) => {
                      const statusBadge =
                        r.status === "assigned" ? "badge badge-green" : "badge badge-yellow";

                      return (
                        <tr
                          key={r.id}
                          className={`hover:bg-zinc-50 ${idx % 2 ? "bg-white" : "bg-zinc-50/30"}`}
                        >
                          <td className="py-3 pr-3 pl-4 whitespace-nowrap">
                            {new Date(r.created_at).toLocaleString()}
                            <div className="mt-1 text-xs opacity-60 font-mono">
                              <Link className="underline" href={`/quotes/${r.id}`}>
                                {r.id}
                              </Link>
                            </div>
                          </td>

                          <td className="py-3 pr-3">
                            <span className={statusBadge}>
                              {r.status === "assigned" ? tl("assigned") : tl("unassigned")}
                            </span>
                          </td>

                          <td className="py-3 pr-3">{r.partner_name ?? "-"}</td>
                          <td className="py-3 pr-3">{r.territory_name ?? "-"}</td>
                          <td className="py-3 pr-3">{r.address ?? "-"}</td>

                          <td className="py-3 pr-3 font-mono text-xs">
                            {Number(r.lat).toFixed(5)}, {Number(r.lng).toFixed(5)}
                          </td>

                          <td className="py-3 pr-3 font-mono text-xs">{r.reason ?? "-"}</td>

                          <td className="py-3 pr-4 whitespace-nowrap">
                            <div className="flex flex-wrap gap-2">
                              <Link className="btn btn-secondary px-3 py-1.5" href={`/quotes/${r.id}`}>
                                {tl("view")}
                              </Link>

                              <Link
                                className="btn btn-secondary px-3 py-1.5"
                                href={`/map?lat=${encodeURIComponent(r.lat)}&lng=${encodeURIComponent(
                                  r.lng
                                )}&quoteId=${encodeURIComponent(r.id)}`}
                              >
                                {tl("openMap")}
                              </Link>

                              {admin ? (
                                <button
                                  className="btn btn-danger px-3 py-1.5"
                                  onClick={() => deleteQuote(r.id)}
                                >
                                  {tl("delete")}
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs text-zinc-500">
              {rows.length ? `${rows.length} ${tl("rowsShown")}` : ""}
            </div>

            <button
              className="btn btn-secondary"
              onClick={() => loadQuotes(false)}
              disabled={!hasMore || listLoading}
            >
              {listLoading ? tl("loading") : hasMore ? tl("loadMore") : tl("noMore")}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
