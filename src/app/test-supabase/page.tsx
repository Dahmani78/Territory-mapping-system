"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Partner = { id: string; name: string };

export default function TestSupabasePage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadPartners = async () => {
    setErrorMsg(null);
    const { data, error } = await supabase
      .from("partners")
      .select("id,name")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      setErrorMsg(error.message);
      return;
    }
    setPartners(data ?? []);
  };

  const addPartner = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setErrorMsg(null);

    const { error } = await supabase.from("partners").insert({ name });

    setLoading(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setName("");
    loadPartners();
  };

  useEffect(() => {
    loadPartners();
  }, []);

  return (
    <main className="p-6 max-w-xl">
      <h1 className="text-xl font-semibold">Test Supabase - Partners</h1>

      <div className="mt-4 flex gap-2">
        <input
          className="border rounded px-3 py-2 w-full"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nom du partenaire"
        />
        <button
          className="border rounded px-4 py-2"
          onClick={addPartner}
          disabled={loading}
        >
          {loading ? "..." : "Ajouter"}
        </button>
      </div>

      {errorMsg && (
        <p className="mt-3 text-sm text-red-600">Erreur: {errorMsg}</p>
      )}

      <ul className="mt-6 space-y-2">
        {partners.map((p) => (
          <li key={p.id} className="border rounded px-3 py-2">
            {p.name}
          </li>
        ))}
      </ul>
    </main>
  );
}
