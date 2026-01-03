import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();

  if (!q) {
    return NextResponse.json({ error: "Missing query param q" }, { status: 400 });
  }

  // Nominatim usage policy: include a valid User-Agent; keep requests reasonable
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": "territory-mapping-system/1.0 (demo)"
    },
    cache: "no-store"
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Geocoding failed" }, { status: 502 });
  }

  const data = (await res.json()) as any[];

  if (!data?.length) {
    return NextResponse.json({ ok: true, found: false });
  }

  const first = data[0];
  return NextResponse.json({
    ok: true,
    found: true,
    lat: Number(first.lat),
    lng: Number(first.lon),
    displayName: String(first.display_name ?? "")
  });
}
