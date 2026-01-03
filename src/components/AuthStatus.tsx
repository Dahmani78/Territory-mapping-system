"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { supabase } from "@/lib/supabaseClient";

export default function AuthStatus() {
  const t = useTranslations("Auth");
  const router = useRouter();
  const params = useParams();

  const locale = String(params?.locale ?? "en");

  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setEmail(data.user?.email ?? null);
    };

    init();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      init();
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

  if (!email) {
    return (
      <Link className="underline text-sm" href={`/${locale}/login`}>
        {t("login")}
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm opacity-80">
        {t("loggedInAs")}{" "}
        <span className="font-medium">{email}</span>
      </span>

      <button className="underline text-sm" onClick={logout}>
        {t("logout")}
      </button>
    </div>
  );
}
