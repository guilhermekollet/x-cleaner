import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Script from "next/script";
import { getDictionary, hasLocale, localeInfo, locales } from "@/i18n/dictionaries";
import { htmlClassName, themeScript } from "@/lib/document";
import "../globals.css";

// One static page per language; any other value in the URL is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  return getDictionary(lang).meta;
}

export default async function LangLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  return (
    <html lang={localeInfo[lang].htmlLang} suppressHydrationWarning className={htmlClassName}>
      <body className="font-sans">
        {/* Sets the theme before hydration: the saved choice or, if there is none, the system's. */}
        <Script id="theme" strategy="beforeInteractive">
          {themeScript}
        </Script>
        {children}
      </body>
    </html>
  );
}
