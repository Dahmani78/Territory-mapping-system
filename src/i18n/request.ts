import { getRequestConfig } from "next-intl/server";

const locales = ["en", "fr"] as const;
const defaultLocale = "en";

export default getRequestConfig(async ({ requestLocale }) => {
  // requestLocale peut être async et parfois undefined
  let locale = await requestLocale;

  if (!locale || !locales.includes(locale as any)) {
    locale = defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default
  };
});
