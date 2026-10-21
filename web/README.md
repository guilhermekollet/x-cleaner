# X Cleaner website

The marketing site for [X Cleaner](../README.md), built with Next.js (static export) and Tailwind
CSS, published to GitHub Pages. Content is in English and Portuguese.

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
```

## Build

```bash
npm run build    # static files in out/
```

The root URL redirects to the visitor's language (`/en` or `/pt`); each language is a static page.
Copy lives in [`i18n/dictionaries.ts`](i18n/dictionaries.ts) — keep its claims in step with the
project README so the site never promises more than the extension does.

## Deploy

`.github/workflows/pages.yml` builds and publishes the site to GitHub Pages on every push to `main`
that touches `web/`. It passes the Pages base path (`/x-cleaner`) in through `PAGES_BASE_PATH`, which
`next.config.ts` reads; locally the base path is empty, so the dev server serves the site at the root.

## Layout

```
app/
  (root)/          The root URL: a tiny page that redirects to the visitor's language
  [lang]/          One static page per language (en, pt): layout.tsx + page.tsx
  global-not-found.tsx   The 404 page, in both languages
  globals.css      Theme tokens (x.com's black/white + blue accent) and animations
components/
  mark.tsx         The broom logo and the GitHub glyph
  header-menu.tsx  Language switcher and light/dark toggle
  motion-bits.tsx  Reveal-on-scroll observer
  popup-demo.tsx   The animated mock of the extension popup in the hero
  history-demo.tsx The still mock of the extension's history page, in the history section
i18n/              Dictionaries (all copy) and the browser-language detector
lib/document.ts    Fonts, the theme script, and the Pages base path
```
