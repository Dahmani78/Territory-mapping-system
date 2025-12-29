"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { supabase } from "@/lib/supabaseClient";

type Partner = {
  id: string;
  name: string;
  partner_type: string | null;
  languages: string[] | null;
  contact: any | null;
  active: boolean | null;
  created_at: string;
};

const LANG_OPTIONS = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" }
];

export default function PartnersPage() {
  const t = useTranslations("Partners");

  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const isEditing = useMemo(() => !!editingId, [editingId]);

  const [name, setName] = useState("");
  const [partnerType, setPartnerType] = useState("");
  const [languages, setLanguages] = useState<string[]>(["en"]);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [active, setActive] = useState(true);

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setPartnerType("");
    setLanguages(["en"]);
    setContactName("");
    setContactEmail("");
    setContactPhone("");
    setActive(true);
    setErrorMsg(null);
  };

  const loadPartners = async () => {
    setLoading(true);
    setErrorMsg(null);

    const { data, error } = await supabase
      .from("partners")
      .select("id,name,partner_type,languages,contact,active,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setErrorMsg(`${t("loadError")}: ${error.message}`);
      setPartners([]);
      setLoading(false);
      return;
    }

    setPartners((data ?? []) as Partner[]);
    setLoading(false);
  };

  useEffect(() => {
    loadPartners();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startEdit = (p: Partner) => {
    setEditingId(p.id);
    setName(p.name ?? "");
    setPartnerType(p.partner_type ?? "");
    setLanguages(p.languages ?? ["en"]);
    setContactName(p.contact?.name ?? "");
    setContactEmail(p.contact?.email ?? "");
    setContactPhone(p.contact?.phone ?? "");
    setActive(p.active ?? true);
    setErrorMsg(null);
  };

  const toggleLanguage = (code: string) => {
    setLanguages((prev) =>
      prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code]
    );
  };

  const savePartner = async () => {
    setSaving(true);
    setErrorMsg(null);

    try {
      if (!name.trim()) {
        setErrorMsg("Name is required.");
        return;
      }

      const payload = {
        name: name.trim(),
        partner_type: partnerType.trim() ? partnerType.trim() : null,
        languages: languages.length ? languages : null,
        contact: {
          name: contactName.trim() || null,
          email: contactEmail.trim() || null,
          phone: contactPhone.trim() || null
        },
        active
      };

      const res = editingId
        ? await supabase.from("partners").update(payload).eq("id", editingId)
        : await supabase.from("partners").insert(payload);

      if (res.error) {
        // Typical message when not admin (RLS)
        if (String(res.error.message).toLowerCase().includes("row-level security")) {
          throw new Error(t("adminOnly"));
        }
        throw new Error(res.error.message);
      }

      await loadPartners();
      resetForm();
    } catch (e: any) {
      setErrorMsg(`${t("saveError")}: ${e?.message ?? "Unexpected error"}`);
    } finally {
      setSaving(false);
    }
  };

  const deletePartner = async (id: string) => {
    if (!confirm(t("confirmDelete"))) return;

    setErrorMsg(null);
    const { error } = await supabase.from("partners").delete().eq("id", id);

    if (error) {
  const msgLower = error.message.toLowerCase();

  const isBlocked =
    msgLower.includes("violates foreign key") ||
    msgLower.includes("foreign key") ||
    msgLower.includes("territories exist") ||
    msgLower.includes("cannot delete partner");

  // ✅ If blocked, show the full translated sentence only (no prefix)
  if (isBlocked) {
    setErrorMsg(t("deleteBlocked"));
    return;
  }

  // Otherwise keep a generic prefix + raw error
  setErrorMsg(`${t("deleteError")}: ${error.message}`);
  return;
}


    await loadPartners();
    if (editingId === id) resetForm();
  };

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-1 text-sm opacity-80">{t("subtitle")}</p>

      {errorMsg && (
        <div className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {/* List */}
        <section className="rounded border p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{t("listTitle")}</h2>
            <button className="underline text-sm" onClick={resetForm}>
              {t("new")}
            </button>
          </div>

          {loading ? (
            <div className="mt-4 text-sm opacity-70">Loading...</div>
          ) : partners.length === 0 ? (
            <div className="mt-4 text-sm opacity-70">(No partners)</div>
          ) : (
            <ul className="mt-4 space-y-2">
              {partners.map((p) => (
                <li
                  key={p.id}
                  className="flex items-start justify-between gap-3 rounded border p-3"
                >
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs opacity-70">
                      {p.partner_type ?? "-"} ·{" "}
                      {(p.languages ?? []).length ? (p.languages ?? []).join(", ") : "-"} ·{" "}
                      {p.active ? "active" : "inactive"}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      className="underline text-sm"
                      onClick={() => startEdit(p)}
                    >
                      {t("edit")}
                    </button>
                    <button
                      className="underline text-sm text-red-600"
                      onClick={() => deletePartner(p.id)}
                    >
                      {t("delete")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Form */}
        <section className="rounded border p-4">
          <h2 className="font-semibold">
            {isEditing ? t("editTitle") : t("createTitle")}
          </h2>

          <div className="mt-4 grid gap-3">
            <div>
              <label className="text-sm font-medium">{t("name")}</label>
              <input
                className="mt-1 w-full rounded border px-3 py-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Montreal Installer"
              />
            </div>

            <div>
              <label className="text-sm font-medium">{t("partnerType")}</label>
              <input
                className="mt-1 w-full rounded border px-3 py-2"
                value={partnerType}
                onChange={(e) => setPartnerType(e.target.value)}
                placeholder="installation / lettering"
              />
            </div>

            <div>
              <label className="text-sm font-medium">{t("languages")}</label>
              <div className="mt-2 flex flex-wrap gap-3">
                {LANG_OPTIONS.map((opt) => (
                  <label key={opt.code} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={languages.includes(opt.code)}
                      onChange={() => toggleLanguage(opt.code)}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
              <div className="mt-1 text-xs opacity-70">{t("languagesHint")}</div>
            </div>

            <div className="rounded border p-3">
              <div className="text-sm font-medium">{t("contact")}</div>

              <div className="mt-3 grid gap-3">
                <div>
                  <label className="text-sm">{t("contactName")}</label>
                  <input
                    className="mt-1 w-full rounded border px-3 py-2"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm">{t("contactEmail")}</label>
                  <input
                    className="mt-1 w-full rounded border px-3 py-2"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm">{t("contactPhone")}</label>
                  <input
                    className="mt-1 w-full rounded border px-3 py-2"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              <span>{t("active")}</span>
            </label>

            <div className="flex gap-2">
              <button
                className="rounded border px-4 py-2"
                onClick={savePartner}
                disabled={saving}
              >
                {saving ? t("saving") : t("save")}
              </button>
              <button className="rounded border px-4 py-2" onClick={resetForm}>
                {t("new")}
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
