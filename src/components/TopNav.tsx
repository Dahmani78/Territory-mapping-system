"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";

import LanguageSwitcher from "@/components/LanguageSwitcher";
import AuthStatus from "@/components/AuthStatus";
import { isAdmin } from "@/lib/authRole";

export default function TopNav() {
  const t = useTranslations("Nav");
  const locale = useLocale();

  const [adminChecked, setAdminChecked] = useState(false);
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    (async () => {
      const ok = await isAdmin();
      setAdmin(ok);
      setAdminChecked(true);
    })();
  }, []);

  const href = (path: string) => `/${locale}${path}`;

  return (
    <header className="border-b">
      <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
        <nav className="flex gap-4 text-sm">
          <Link className="underline" href={href("/map")}>
            {t("map")}
          </Link>

          {/* ✅ Partners visible ONLY for admins (after role check) */}
          {adminChecked && admin && (
            <Link className="underline" href={href("/partners")}>
              {t("partners")}
            </Link>
          )}

          <Link className="underline" href={href("/quotes")}>
            {t("quotes")}
          </Link>
        </nav>

        <div className="flex items-center gap-4">
          <AuthStatus />

          <div className="flex items-center gap-3">
            <span className="text-sm opacity-70">{t("lang")}:</span>
            <LanguageSwitcher />
          </div>
        </div>
      </div>
    </header>
  );
}
