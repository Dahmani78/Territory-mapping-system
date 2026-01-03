"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { supabase } from "@/lib/supabaseClient";
import { isAdmin } from "@/lib/authRole";

type QuoteDetailRow = {
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

export default function QuoteDetailPage() {
  const t = useTranslations("QuoteDetail");
  const c = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const params = useParams();
  const id = String(params?.id ?? "");

  const [admin, setAdmin] = useState(false);

  const [row, setRow] = useState<QuoteDetailRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const openMapHref = useMemo(() => {
    if (!row) return `/${locale}/map`;
    return `/${locale}/map?lat=${encodeURIComponent(row.lat)}&lng=${encodeURIComponent(
      row.lng
    )}&quoteId=${encodeURIComponent(row.id)}`;
  }, [row, locale]);

  useEffect(() => {
    (async () => {
      try {
        setAdmin(await isAdmin());
      } catch {
        setAdmin(false);
      }
    })();
  }, []);

  const load = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      if (!id) throw new Error("Missing id");

      // Repose sur votre vue existante v_quotes_list
      const { data, error } = await supabase
        .from("v_quotes_list")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) throw new Error(t("notFound"));

      setRow(data as QuoteDetailRow);
    } catch (e: any) {
      setErrorMsg(`${c("errorPrefix")}: ${e?.message ?? "Unexpected error"}`);
      setRow(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const deleteQuote = async () => {
    if (!row) return;
    const ok = confirm(t("confirmDelete"));
    if (!ok) return;

    setErrorMsg(null);

    const { error } = await supabase.from("quotes").delete().eq("id", row.id);
    if (error) {
      setErrorMsg(`${c("errorPrefix")}: ${error.message}`);
      return;
    }

    router.push(`/${locale}/quotes`);
    router.refresh();
  };

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <div className="mt-1 text-sm opacity-70">
            <Link className="underline" href={`/${locale}/quotes`}>
              {t("backToList")}
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link className="btn btn-secondary" href={openMapHref}>
            {t("openMap")}
          </Link>

          {admin && row ? (
            <button className="btn btn-danger" onClick={deleteQuote}>
              {t("delete")}
            </button>
          ) : null}
        </div>
      </div>

      {errorMsg && (
        <div className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="mt-6 text-sm opacity-70">{t("loading")}</div>
      ) : !row ? (
        <div className="mt-6 text-sm opacity-70">{t("notFound")}</div>
      ) : (
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {/* Main card */}
          <section className="md:col-span-2 rounded-xl border p-5 bg-white">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm opacity-70">{t("quoteId")}</div>
              <div className="font-mono text-xs">{row.id}</div>
            </div>

            <div className="mt-4 grid gap-3">
              <div>
                <div className="text-xs opacity-70">{t("createdAt")}</div>
                <div className="text-sm font-medium">
                  {new Date(row.created_at).toLocaleString()}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs opacity-70">{t("lat")}</div>
                  <div className="font-mono text-sm">{Number(row.lat).toFixed(6)}</div>
                </div>
                <div>
                  <div className="text-xs opacity-70">{t("lng")}</div>
                  <div className="font-mono text-sm">{Number(row.lng).toFixed(6)}</div>
                </div>
              </div>

              <div>
                <div className="text-xs opacity-70">{t("address")}</div>
                <div className="text-sm">{row.address ?? "-"}</div>
              </div>

              <div className="pt-2 border-t">
                <div className="text-xs opacity-70">{t("assignment")}</div>
                <div className="mt-2 grid gap-2 text-sm">
                  <div>
                    <span className="opacity-70">{t("status")}: </span>
                    <span className="font-medium">{row.status}</span>
                  </div>

                  <div>
                    <span className="opacity-70">{t("partner")}: </span>
                    <span className="font-medium">{row.partner_name ?? "-"}</span>
                  </div>

                  <div>
                    <span className="opacity-70">{t("territory")}: </span>
                    <span className="font-medium">{row.territory_name ?? "-"}</span>
                  </div>

                  {row.reason ? (
                    <div>
                      <span className="opacity-70">{t("reason")}: </span>
                      <span className="font-mono text-xs">{row.reason}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          {/* Timeline card */}
          <aside className="rounded-xl border p-5 bg-white">
            <div className="font-semibold">{t("timeline")}</div>

            <ol className="mt-4 space-y-3 text-sm">
              <li className="rounded border p-3">
                <div className="text-xs opacity-70">{t("step1Title")}</div>
                <div className="font-medium">{t("step1Body")}</div>
                <div className="mt-1 text-xs opacity-70">
                  {new Date(row.created_at).toLocaleString()}
                </div>
              </li>

              <li className="rounded border p-3">
                <div className="text-xs opacity-70">{t("step2Title")}</div>
                <div className="font-medium">
                  {row.status === "assigned" ? t("step2Assigned") : t("step2Unassigned")}
                </div>
                {row.status === "unassigned" && row.reason ? (
                  <div className="mt-1 text-xs font-mono opacity-70">{row.reason}</div>
                ) : null}
              </li>

              <li className="rounded border p-3">
                <div className="text-xs opacity-70">{t("step3Title")}</div>
                <div className="font-medium">{t("step3Body")}</div>
                <Link className="underline text-xs" href={openMapHref}>
                  {t("openMap")}
                </Link>
              </li>
            </ol>
          </aside>
        </div>
      )}
    </main>
  );
}
