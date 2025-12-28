"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function LanguageSwitcher() {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  const currentLocale = parts[0] ?? "en";
  const rest = parts.slice(1).join("/");

  const otherLocale = currentLocale === "en" ? "fr" : "en";
  const target = rest ? `/${otherLocale}/${rest}` : `/${otherLocale}`;

  return (
    <Link className="underline" href={target}>
      {otherLocale.toUpperCase()}
    </Link>
  );
}
