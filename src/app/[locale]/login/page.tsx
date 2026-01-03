"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { supabase } from "@/lib/supabaseClient";

function friendlyAuthError(message: string) {
  const m = (message || "").toLowerCase();

  if (m.includes("invalid login credentials")) return "Invalid email or password.";
  if (m.includes("email not confirmed")) return "Email not confirmed. Please confirm your email.";
  if (m.includes("email logins are disabled")) return "Email/password logins are disabled in Supabase Auth settings.";
  if (m.includes("too many requests")) return "Too many attempts. Please wait and try again.";
  if (m.includes("network")) return "Network error. Please try again.";
  return message || "Unexpected error.";
}

export default function LoginPage() {
  const t = useTranslations("Auth");
  const router = useRouter();
  const params = useParams();
  const locale = String(params?.locale ?? "en");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [remember, setRemember] = useState(true);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return email.trim().length > 3 && password.length >= 1 && !loading;
  }, [email, password, loading]);

  // Load remember-me preference
  useEffect(() => {
    try {
      const v = localStorage.getItem("auth_remember");
      if (v === "0") setRemember(false);
      if (v === "1") setRemember(true);
    } catch {
      // ignore
    }
  }, []);

  // Save remember-me preference
  useEffect(() => {
    try {
      localStorage.setItem("auth_remember", remember ? "1" : "0");
    } catch {
      // ignore
    }
  }, [remember]);

  // If NOT remember-me: ensure we don't keep session across browser restarts.
  // We do this by signing out on tab close (best-effort).
  useEffect(() => {
    if (remember) return;

    const handler = () => {
      // best-effort sign out
      try {
        void supabase.auth.signOut();
      } catch {
        // ignore
      }
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [remember]);

  const onLogin = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const cleanEmail = email.trim();

      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password
      });

      if (error) throw new Error(error.message);

      setSuccessMsg(t("success"));

      // Go to locale home (or map). Choose what you prefer:
      router.push(`/${locale}/map`);
      router.refresh();
    } catch (e: any) {
      setErrorMsg(friendlyAuthError(e?.message ?? ""));
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && canSubmit) {
      e.preventDefault();
      void onLogin();
    }
  };

  return (
    <main className="min-h-[calc(100vh-56px)] bg-zinc-50">
      <div className="mx-auto max-w-md px-6 py-10">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          {/* Header */}
          <div className="mb-5">
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              {t("brand")}
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-zinc-900">
              {t("title")}
            </h1>
            <p className="mt-2 text-sm text-zinc-600">{t("subtitle")}</p>
          </div>

          {/* Alerts */}
          {errorMsg && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              {successMsg}
            </div>
          )}

          {/* Form */}
          <div className="grid gap-4" onKeyDown={onKeyDown}>
            <div>
              <label className="block text-sm font-medium text-zinc-800">
                {t("email")}
              </label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-zinc-200"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                autoComplete="email"
                inputMode="email"
              />
              <div className="mt-1 text-xs text-zinc-500">{t("emailHint")}</div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-800">
                {t("password")}
              </label>
              <input
                type="password"
                className="mt-1 w-full rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-zinc-200"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                {t("remember")}
              </label>

              <Link className="text-sm underline text-zinc-700" href={`/${locale}/quotes`}>
                {t("backToApp")}
              </Link>
            </div>

            <button
              className="mt-1 w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              onClick={onLogin}
              disabled={!canSubmit}
            >
              {loading ? t("loading") : t("login")}
            </button>

            <div className="text-xs text-zinc-500">
              {t("securityNote")}
            </div>
          </div>
        </div>

        <div className="mt-4 text-center text-xs text-zinc-500">
          {t("footer")}
        </div>
      </div>
    </main>
  );
}
