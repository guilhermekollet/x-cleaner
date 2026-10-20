import type { Metadata } from "next";
import Script from "next/script";
import { detectLocaleExpression } from "@/i18n/detect";
import { basePath } from "@/lib/document";

export const metadata: Metadata = {
  title: "X Cleaner",
};

const redirectScript = `location.replace(${JSON.stringify(basePath)}+"/"+${detectLocaleExpression}+"/"+location.hash)`;

// The root URL only sends visitors to their language, so it has its own bare layout.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <head>
        <meta name="color-scheme" content="light dark" />
      </head>
      <body>
        <Script id="language-redirect" strategy="beforeInteractive">
          {redirectScript}
        </Script>
        {children}
      </body>
    </html>
  );
}
