"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const QuoteMiniMap = dynamic(() => import("@/components/quotes/QuoteMiniMap"), {
  ssr: false
});

type QuoteRow = {
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

type TerritoryGeo = {
  id: string;
  geojson: any; // view returns json or string
};

function Badge({ status }: { status: "assigned" | "unassigned" }) {
  const cls =
    status === "assigned"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : "bg-amber-50 text-amber-800 border-amber-200";

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${cls}`}>
      {status.toUpperCase()}
    </span>
  );
}

function TimelineItem({
  title,
  meta,
  children
}: {
  title: string;
  meta?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative pl-6">
      <div className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full border bg-white" />
      <div className="rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="font-medium">{title}</div>
          {meta ? <div className="text-xs text-zinc-500">{meta}</div> : null}
        </div>
        {children ? <div className="mt-2 text-sm text-zinc-700">{children}</div> : null}
      </div>
    </div>
  );
}

export default function QuoteDetailsPage() {
  const locale = useLocale();
  const params = useParams();
  const id = String(params?.id ?? "");

  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<QuoteRow | null>(null);
  const [territoryGeojson, setTerritoryGeojson] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const href = (path: string) => `/${locale}${path}`;

  const openInMapHref = useMemo(() => {
    if (!quote) return href("/map");
    const q = new URLSearchParams({
      lat: String(quote.lat),
      lng: String(quote.lng),
      quoteId: quote.id
    });
    return `${href("/map")}?${q.toString()}`;
  }, [quote, locale]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setErrorMsg(null);
      setTerritoryGeojson(null);

      try {
        const { data, error } = await supabase
          .from("v_quotes_list")
          .select("*")
          .eq("id", id)
          .single();

        if (error) throw new Error(error.message);

        const row = data as QuoteRow;
        if (!mounted) return;
        setQuote(row);

        // Charger le territoire (si assigné)
        if (row.territory_id) {
          const { data: tdata, error: terrErr } = await supabase
            .from("v_territories_geojson")
            .select("id, geojson")
            .eq("id", row.territory_id)
            .single();

          if (!terrErr && tdata) {
            const terr = tdata as TerritoryGeo;
            const gj = typeof terr.geojson === "string" ? JSON.parse(terr.geojson) : terr.geojson;
            if (mounted) setTerritoryGeojson(gj);
          }
        }
      } catch (e: any) {
        if (mounted) setErrorMsg(e?.message ?? "Unexpected error");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    if (id) void load();

    return () => {
      mounted = false;
    };
  }, [id]);

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <div className="text-sm text-zinc-600">Loading…</div>
      </main>
    );
  }

  if (errorMsg || !quote) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorMsg ?? "Quote not found"}
        </div>
        <div className="mt-4">
          <Link className="underline" href={href("/quotes")}>
            ← Back to Quotes
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs text-zinc-500">Quote</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            #{quote.id.slice(0, 8)}
          </h1>
          <div className="mt-1 text-sm text-zinc-600">
            Created {new Date(quote.created_at).toLocaleString()}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Badge status={quote.status} />
          <Link
            className="rounded-lg border bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50"
            href={openInMapHref}
          >
            Open in map
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Left: Map + key facts */}
        <div className="space-y-6">
          <QuoteMiniMap
            lat={Number(quote.lat)}
            lng={Number(quote.lng)}
            territoryGeojson={territoryGeojson}
          />

          <div className="rounded-xl border bg-white p-5">
            <div className="text-sm font-semibold">Summary</div>

            <dl className="mt-4 grid gap-3 text-sm">
              <div>
                <dt className="text-xs text-zinc-500">Address</dt>
                <dd className="mt-1">{quote.address ?? "-"}</dd>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-xs text-zinc-500">Partner</dt>
                  <dd className="mt-1 font-medium">{quote.partner_name ?? "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-500">Territory</dt>
                  <dd className="mt-1 font-medium">{quote.territory_name ?? "-"}</dd>
                </div>
              </div>

              {quote.status === "unassigned" ? (
                <div>
                  <dt className="text-xs text-zinc-500">Reason</dt>
                  <dd className="mt-1 font-mono text-xs">{quote.reason ?? "-"}</dd>
                </div>
              ) : null}
            </dl>
          </div>

          <div>
            <Link className="underline text-sm" href={href("/quotes")}>
              ← Back to Quotes
            </Link>
          </div>
        </div>

        {/* Right: Timeline */}
        <div className="rounded-xl border bg-zinc-50 p-5">
          <div className="text-sm font-semibold">Timeline</div>
          <div className="mt-4 space-y-4 border-l pl-4">
            <TimelineItem
              title="Quote created"
              meta={new Date(quote.created_at).toLocaleString()}
            >
              {quote.address ? (
                <div className="text-zinc-700">{quote.address}</div>
              ) : (
                <div className="text-zinc-700">Coordinates provided</div>
              )}
              <div className="mt-1 font-mono text-xs text-zinc-600">
                {Number(quote.lat).toFixed(6)}, {Number(quote.lng).toFixed(6)}
              </div>
            </TimelineItem>

            {quote.status === "assigned" ? (
              <TimelineItem title="Assigned to partner" meta="Territory match (priority)">
                <div>
                  Partner: <span className="font-medium">{quote.partner_name}</span>
                </div>
                <div className="mt-1">
                  Territory: <span className="font-medium">{quote.territory_name}</span>
                </div>
              </TimelineItem>
            ) : (
              <TimelineItem title="No territory matched" meta="Unassigned">
                <div className="font-mono text-xs">{quote.reason ?? "No match"}</div>
              </TimelineItem>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
