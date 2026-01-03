"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { isAdmin } from "@/lib/authRole";

export default function HomePage() {
  const t = useTranslations("Home");
  const nav = useTranslations("Nav");
  const locale = useLocale();

  const [adminChecked, setAdminChecked] = useState(false);
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const ok = await isAdmin();
        setAdmin(ok);
      } catch {
        setAdmin(false);
      } finally {
        setAdminChecked(true);
      }
    })();
  }, []);

  const href = (path: string) => `/${locale}${path}`;

  return (
    <main className="app-container">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="mt-1 text-sm text-zinc-500">{t("subtitle")}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link className="btn btn-secondary" href={href("/map")}>
            {nav("map")}
          </Link>
          <Link className="btn btn-secondary" href={href("/quotes")}>
            {nav("quotes")}
          </Link>
          {adminChecked && admin && (
            <Link className="btn btn-primary" href={href("/partners")}>
              {nav("partners")}
            </Link>
          )}
        </div>
      </div>

      {/* Main cards */}
      <section className="mt-6 grid gap-4 md:grid-cols-2">
        {/* Map */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">{t("ctaMapTitle")}</div>
              <div className="card-subtitle">{t("ctaMapDesc")}</div>
            </div>
            <span className="badge">{t("ctaPrimary")}</span>
          </div>
          <div className="card-body">
            <div className="flex flex-wrap gap-2">
              <Link className="btn btn-primary" href={href("/map")}>
                {t("openMap")}
              </Link>
              <Link className="btn btn-secondary" href={href("/map")}>
                {t("manageTerritories")}
              </Link>
            </div>
            <div className="mt-3 text-xs text-zinc-500">{t("mapHint")}</div>
          </div>
        </div>

        {/* Quotes */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">{t("ctaQuotesTitle")}</div>
              <div className="card-subtitle">{t("ctaQuotesDesc")}</div>
            </div>
            <span className="badge">{t("ctaWorkflow")}</span>
          </div>
          <div className="card-body">
            <div className="flex flex-wrap gap-2">
              <Link className="btn btn-primary" href={href("/quotes")}>
                {t("openQuotes")}
              </Link>
              <Link className="btn btn-secondary" href={href("/quotes")}>
                {t("createQuote")}
              </Link>
            </div>
            <div className="mt-3 text-xs text-zinc-500">{t("quotesHint")}</div>
          </div>
        </div>

        {/* Partners (admin only) */}
        <div className="card md:col-span-2">
          <div className="card-header">
            <div>
              <div className="card-title">{t("ctaPartnersTitle")}</div>
              <div className="card-subtitle">{t("ctaPartnersDesc")}</div>
            </div>

            {adminChecked ? (
              admin ? (
                <span className="badge badge-green">{t("adminOnly")}</span>
              ) : (
                <span className="badge badge-yellow">{t("restricted")}</span>
              )
            ) : (
              <span className="badge">{t("checkingRole")}</span>
            )}
          </div>

          <div className="card-body">
            {adminChecked && admin ? (
              <div className="flex flex-wrap items-center gap-2">
                <Link className="btn btn-primary" href={href("/partners")}>
                  {t("openPartners")}
                </Link>
                <div className="text-sm text-zinc-500">{t("partnersHint")}</div>
              </div>
            ) : (
              <div className="alert alert-info">
                <div className="font-medium">{t("partnersNoAccessTitle")}</div>
                <div className="mt-1 text-zinc-600">{t("partnersNoAccessDesc")}</div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Footer helper */}
      <div className="mt-6 text-xs text-zinc-500">
        {t("footer")}
      </div>
    </main>
  );
}
