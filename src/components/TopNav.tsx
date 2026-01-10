"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";

import LanguageSwitcher from "@/components/LanguageSwitcher";
import AuthStatus from "@/components/AuthStatus";
import { isAdmin } from "@/lib/authRole";

import { supabase } from "@/lib/supabaseClient";


type NavItem = { key: "map" | "quotes" | "partners"; path: string; adminOnly?: boolean };

function cx(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

export default function TopNav() {
  const t = useTranslations("Nav");
  const locale = useLocale();
  const pathname = usePathname();

  const [adminChecked, setAdminChecked] = useState(false);
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
  let mounted = true;

  const checkAdmin = async () => {
    try {
      const ok = await isAdmin();
      if (!mounted) return;
      setAdmin(ok);
    } catch {
      if (!mounted) return;
      setAdmin(false);
    } finally {
      if (!mounted) return;
      setAdminChecked(true);
    }
  };

  // Check au chargement
  checkAdmin();

  // Re-check après login / logout / refresh token
  const { data: sub } = supabase.auth.onAuthStateChange(() => {
    checkAdmin();
  });

  return () => {
    mounted = false;
    sub.subscription.unsubscribe();
  };
}, []);


  const href = (path: string) => `/${locale}${path}`;

  const items: NavItem[] = useMemo(
    () => [
      { key: "map", path: "/map" },
      { key: "quotes", path: "/quotes" },
      { key: "partners", path: "/partners", adminOnly: true }
    ],
    []
  );

  const isActive = (path: string) => {
    const full = href(path);
    return pathname === full || pathname?.startsWith(full + "/");
  };

  return (
    <header className="sticky top-0 z-[6000] border-b bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        {/* Left: Brand + nav */}
        <div className="flex items-center gap-6">
          {/* ✅ Brand now links to HOME (/{locale}) instead of /map */}
          <Link href={`/${locale}`} className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-zinc-900" />
            <div className="leading-tight">
              <div className="text-sm font-semibold text-zinc-900">
                {t("brand")}
              </div>
              <div className="text-xs text-zinc-500">{t("brandSubtitle")}</div>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-2 text-sm">
            {items.map((it) => {
              if (it.adminOnly) {
                if (!adminChecked) return null; // avoid flicker
                if (!admin) return null;
              }

              const active = isActive(it.path);

              return (
                <Link
                  key={it.key}
                  href={href(it.path)}
                  className={cx(
                    "rounded-lg px-3 py-2 transition",
                    active
                      ? "bg-zinc-900 text-white"
                      : "text-zinc-700 hover:bg-zinc-100"
                  )}
                >
                  {t(it.key)}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right: Role + Language */}
        <div className="flex items-center gap-3">
          <AuthStatus />

          <div className="h-6 w-px bg-zinc-200" />

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-xs text-zinc-500">
              {t("lang")}:
            </span>
            <LanguageSwitcher />
          </div>
        </div>
      </div>

      {/* Mobile nav */}
      <div className="md:hidden border-t bg-white/80">
        <div className="mx-auto max-w-6xl px-4 py-2 flex gap-2">
          {items.map((it) => {
            if (it.adminOnly) {
              if (!adminChecked) return null;
              if (!admin) return null;
            }
            const active = isActive(it.path);

            return (
              <Link
                key={it.key}
                href={href(it.path)}
                className={cx(
                  "flex-1 text-center rounded-lg px-3 py-2 text-sm transition",
                  active
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-700 hover:bg-zinc-100"
                )}
              >
                {t(it.key)}
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
