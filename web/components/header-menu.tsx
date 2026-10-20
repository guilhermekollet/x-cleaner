"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { localeInfo, locales, type Locale } from "@/i18n/dictionaries";
import type { Dictionary } from "@/i18n/dictionaries";

// Language switcher and light/dark toggle. Both persist the choice so the root redirect and the
// theme script pick it up next time.
export function HeaderMenu({ lang, dict }: { lang: Locale; dict: Dictionary }) {
  const router = useRouter();
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    if (current === "light" || current === "dark") setTheme(current);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {}
  }

  function pickLang(value: Locale) {
    try {
      localStorage.setItem("lang", value);
    } catch {}
    router.push(`/${value}/`);
  }

  return (
    <div className="flex items-center gap-1" aria-label={dict.a11y.menu}>
      <div className="flex items-center rounded-full border border-line p-0.5" role="group" aria-label={dict.menu.language}>
        {locales.map((l) => (
          <button
            key={l}
            onClick={() => pickLang(l)}
            aria-current={l === lang}
            className={`press rounded-full px-2.5 py-1 text-xs font-semibold ${
              l === lang ? "bg-pill text-pill-fg" : "text-fg/60 hover:text-fg"
            }`}
          >
            {localeInfo[l].short}
          </button>
        ))}
      </div>
      <button
        onClick={toggleTheme}
        className="press grid size-9 place-items-center rounded-full border border-line text-fg/80 hover:text-fg"
        aria-label={dict.menu.appearance}
      >
        <svg className="only-light size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
        </svg>
        <svg className="only-dark size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      </button>
    </div>
  );
}
