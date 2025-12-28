"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import LanguageSwitcher from "@/components/LanguageSwitcher";

export default function TopNav() {
  const t = useTranslations("Nav");

  return (
    <header className="border-b">
      <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
        <nav className="flex gap-4 text-sm">
          <Link className="underline" href="/map">{t("map")}</Link>
          <Link className="underline" href="/partners">{t("partners")}</Link>
          <Link className="underline" href="/quotes">{t("quotes")}</Link>
          <Link className="underline" href="/test-supabase">{t("test")}</Link>
        </nav>

        <div className="flex items-center gap-3">
          <span className="text-sm opacity-70">{t("lang")}:</span>
          <LanguageSwitcher />
        </div>
      </div>
    </header>
  );
}
