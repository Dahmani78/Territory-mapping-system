"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { supabase } from "@/lib/supabaseClient";

type Role = "admin" | "staff" | "client" | "guest";

function cx(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

function roleLabel(role: Role, t: (k: any) => string) {
  if (role === "admin") return t("roleAdmin");
  if (role === "staff") return t("roleStaff");
  if (role === "client") return t("roleClient");
  return t("roleGuest");
}

function roleBadgeClass(role: Role) {
  if (role === "admin") return "bg-purple-100 text-purple-800 border-purple-200";
  if (role === "staff") return "bg-blue-100 text-blue-800 border-blue-200";
  if (role === "client") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  return "bg-zinc-100 text-zinc-700 border-zinc-200";
}

async function fetchRole(): Promise<"admin" | "staff" | "client" | "guest"> {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return "guest";

  const { data: prof, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (!error && prof?.role) {
    if (prof.role === "admin" || prof.role === "staff" || prof.role === "client") {
      return prof.role;
    }
  }

  return "client"; // fallback logique
}


export default function AuthStatus() {
  const t = useTranslations("Auth");
  const router = useRouter();
  const params = useParams();
  const locale = String(params?.locale ?? "en");

  const [role, setRole] = useState<Role>("guest");
  const [loadingRole, setLoadingRole] = useState(true);

  const loggedIn = useMemo(() => role !== "guest", [role]);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      setLoadingRole(true);
      try {
        const r = await fetchRole();
        if (!mounted) return;
        setRole(r);
      } catch {
        if (!mounted) return;
        setRole("guest");
      } finally {
        if (mounted) setLoadingRole(false);
      }
    };

    void init();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void init();
      router.refresh();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  const logout = async () => {
    await supabase.auth.signOut();
    router.push(`/${locale}/login`);
    router.refresh();
  };

  if (!loggedIn) {
    return (
      <Link className="text-sm rounded-lg border px-3 py-2 hover:bg-zinc-50" href={`/${locale}/login`}>
        {t("login")}
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span
        className={cx(
          "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
          roleBadgeClass(role)
        )}
        title={t("loggedInAsRole")}
      >
        {loadingRole ? t("roleLoading") : roleLabel(role, t)}
      </span>

      <button
        className="text-sm rounded-lg border px-3 py-2 hover:bg-zinc-50"
        onClick={logout}
      >
        {t("logout")}
      </button>
    </div>
  );
}
