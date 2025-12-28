import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // Important avec Turbopack (Next 15/16) pour éviter l'erreur "Couldn't find next-intl config file"
  turbopack: {}
};

export default withNextIntl(nextConfig);

