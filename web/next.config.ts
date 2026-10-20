import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Published as static files on GitHub Pages: `next build` writes them to `out/`.
  output: "export",
  // On GitHub Pages the site lives under /x-cleaner. The deploy workflow passes that path in;
  // locally it stays empty, so `npm run dev` serves the site at the root.
  basePath: process.env.PAGES_BASE_PATH ?? "",
  // Each page is a folder with an index.html, served at both /pt and /pt/.
  trailingSlash: true,
  // Lets app/global-not-found.tsx be the 404 page: each language has its own <html lang>,
  // so there is no single root layout for a regular not-found.tsx to render inside.
  experimental: { globalNotFound: true },
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
};

export default nextConfig;
