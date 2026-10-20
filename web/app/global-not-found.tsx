import type { Metadata } from "next";
import Script from "next/script";
import { htmlClassName } from "@/lib/document";
import { detectLocaleExpression } from "@/i18n/detect";
import "./globals.css";

export const metadata: Metadata = { title: "Not found — X Cleaner" };

// A single 404 page for the whole static site. It sets <html lang> before the first paint, and the
// CSS shows only the matching language's copy.
const setLang = `document.documentElement.lang=${detectLocaleExpression}`;

export default function GlobalNotFound() {
  return (
    <html lang="en" className={htmlClassName}>
      <head>
        <meta name="color-scheme" content="light dark" />
      </head>
      <body className="font-sans">
        <Script id="nf-lang" strategy="beforeInteractive">
          {setLang}
        </Script>
        <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="font-mono text-sm text-fg/50">404</p>
          <h1 className="font-serif text-3xl">
            <span data-copy="en">Page not found</span>
            <span data-copy="pt">Página não encontrada</span>
          </h1>
          <a href="/" className="press rounded-full bg-pill px-5 py-2.5 text-sm font-semibold text-pill-fg">
            <span data-copy="en">Back to the start</span>
            <span data-copy="pt">Voltar ao início</span>
          </a>
        </main>
      </body>
    </html>
  );
}
