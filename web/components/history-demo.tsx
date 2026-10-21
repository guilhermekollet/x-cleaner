"use client";

import { useEffect, useRef, useState } from "react";
import { Mark } from "./mark";
import type { Dictionary, Locale } from "@/i18n/dictionaries";

// A still, faithful mock of the extension's history page (src/history.html) as it opens in a
// browser tab: the page's header with the language flags, the title and privacy note, the count
// with "Download JSON", "Download CSV" and "Clear history", the search, the type chips with their
// counts, and the deleted posts drawn the way the page draws them (like posts on x.com). It is laid
// out at the page's own width (PAGE_WIDTH, its max-width in history.css) and centered in a wide
// browser window, as in a real tab; in a narrower frame it is zoomed down to fit, like a
// screenshot, so the proportions always match. The six
// posts are the hero's fictional ones, as if just deleted. Nothing here is real data.

const PAGE_WIDTH = 720;
const PAGE_HEIGHT = 820; // how much of the page shows, at its own size

export function HistoryDemo({ dict, lang }: { dict: Dictionary; lang: Locale }) {
  const m = dict.history.mock;
  const handle = dict.demo.handle.replace(/^@/, "");
  const frameRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  // Follows the frame's width, so the page always fills it edge to edge.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const fit = () => setZoom(Math.min(1, el.clientWidth / PAGE_WIDTH));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      role="img"
      aria-label={m.label}
      ref={frameRef}
      className="@container relative w-full max-w-[960px] overflow-hidden rounded-[10px] border border-black/15 bg-bg shadow-2xl shadow-black/25 select-none dark:border-white/15"
    >
      {/* Chrome on macOS: the tab strip (window buttons, the page's tab, new tab) and the toolbar
          (back, forward, reload, the omnibox with the page's address, extensions, profile, menu),
          in Chrome's own light and dark colors. */}
      <div className="bg-[#dee1e6] text-[#5f6368] dark:bg-[#202124] dark:text-[#9aa0a6]">
        <div className="flex h-[38px] items-end gap-1 pl-3.5">
          <span className="mr-3 flex gap-2 self-center" aria-hidden="true">
            <i className="size-3 rounded-full bg-[#ff5f57]" />
            <i className="size-3 rounded-full bg-[#febc2e]" />
            <i className="size-3 rounded-full bg-[#28c840]" />
          </span>
          {/* The active tab, joined to the toolbar by curved feet, as Chrome draws it. */}
          <span className="relative flex h-[31px] w-[236px] min-w-0 items-center gap-2 rounded-t-[10px] bg-white px-3 text-[12px] text-[#1f1f1f] dark:bg-[#35363a] dark:text-[#e8eaed]">
            <i className="absolute bottom-0 -left-2.5 size-2.5 [background:radial-gradient(circle_at_0_0,transparent_10px,#fff_10.5px)] dark:[background:radial-gradient(circle_at_0_0,transparent_10px,#35363a_10.5px)]" />
            <i className="absolute -right-2.5 bottom-0 size-2.5 [background:radial-gradient(circle_at_100%_0,transparent_10px,#fff_10.5px)] dark:[background:radial-gradient(circle_at_100%_0,transparent_10px,#35363a_10.5px)]" />
            <Mark className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{m.tab}</span>
            <Icon d="M7 7l10 10M17 7 7 17" className="size-3.5 shrink-0 text-[#5f6368] dark:text-[#9aa0a6]" width={2} />
          </span>
          <span className="ml-1.5 grid size-7 place-items-center self-center">
            <Icon d="M12 5v14M5 12h14" className="size-4" width={2} />
          </span>
        </div>
        <div className="flex h-10 items-center gap-1 bg-white px-2 dark:bg-[#35363a]">
          <ChromeButton d="M19 12H5M11 18l-6-6 6-6" />
          <ChromeButton d="M5 12h14M13 18l6-6-6-6" dim wide />
          <ChromeButton d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
          <span className="mx-1 flex h-[30px] min-w-0 flex-1 items-center gap-2 rounded-full bg-[#f1f3f4] pr-2.5 pl-3 text-[13px] dark:bg-[#202124]">
            <Icon d={PUZZLE} className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              <span className="text-[#1f1f1f] dark:text-[#e8eaed]">chrome-extension://</span>
              {m.address}
            </span>
            <Icon d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" className="size-4 shrink-0" />
          </span>
          <ChromeButton d={PUZZLE} wide />
          <span className="hidden size-[30px] place-items-center @min-[520px]:grid">
            <Mark className="size-[18px] text-[#1f1f1f] dark:text-[#e8eaed]" />
          </span>
          <span className="mx-1 grid size-[22px] place-items-center rounded-full bg-[#1d9bf0] text-[11px] font-bold text-white" aria-hidden="true">
            {handle[0].toUpperCase()}
          </span>
          <span className="grid size-[30px] place-items-center">
            <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5.5" r="1.7" />
              <circle cx="12" cy="12" r="1.7" />
              <circle cx="12" cy="18.5" r="1.7" />
            </svg>
          </span>
        </div>
      </div>
      <div className="h-px bg-[#dadce0] dark:bg-[#202124]" />

      {/* The page, at its own sizes, zoomed to the frame. The list fades out at the bottom, as a
          cropped screenshot would. */}
      <div
        className="overflow-hidden [mask-image:linear-gradient(to_bottom,black_80%,transparent)]"
        style={{ height: PAGE_HEIGHT * zoom }}
      >
        <div className="mx-auto px-5 pt-8 text-[14px] leading-[1.45] text-fg" style={{ width: PAGE_WIDTH, zoom }}>
          {/* Header: the mark, the name and tagline, and the language flags. */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Mark className="size-[30px] text-fg" />
              <div>
                <p className="text-[17px] leading-[1.1] font-extrabold tracking-[-0.02em]">X Cleaner</p>
                <p className="mt-0.5 text-[12px] text-muted">{m.tagline}</p>
              </div>
            </div>
            <div className="relative grid grid-cols-[26px_26px] gap-1">
              {(["en", "pt"] as const).map((l) => (
                <span
                  key={l}
                  className={`grid size-[26px] place-items-center rounded-full ${l === lang ? "shadow-[inset_0_0_0_1.5px_var(--fg)]" : ""}`}
                >
                  <Flag lang={l} on={l === lang} />
                </span>
              ))}
            </div>
          </div>

          <p className="mt-7 text-[26px] leading-[1.15] font-extrabold tracking-[-0.025em]">{m.page}</p>
          <p className="mt-1.5 flex items-start gap-[7px] text-[13px] text-muted">
            <Icon d="M6.5 10.5V7.5a5.5 5.5 0 0 1 11 0v3M5 10.5h14v10H5z" className="mt-0.5 size-[15px] shrink-0" width={2} />
            {m.privacy}
          </p>

          {/* The count and the backups. */}
          <div className="mt-[18px] flex items-center justify-between gap-3.5 rounded-[18px] border border-line bg-surface px-[18px] py-4">
            <div>
              <p className="text-[26px] leading-[1.1] font-extrabold tracking-[-0.02em] tabular-nums">{m.count}</p>
              <p className="text-[13px] text-muted">@{handle}</p>
            </div>
            <div className="flex items-center gap-2 text-[13.5px] font-bold">
              <span className="inline-flex h-9 items-center gap-2 rounded-full bg-pill px-[15px] text-pill-fg">
                <Icon d={DOWNLOAD} className="size-4" width={2} />
                {m.json}
              </span>
              <span className="inline-flex h-9 items-center gap-2 rounded-full border border-line px-[15px]">
                <Icon d={DOWNLOAD} className="size-4" width={2} />
                {m.csv}
              </span>
              <span className="inline-flex h-9 items-center px-2 text-muted">{m.clear}</span>
            </div>
          </div>

          {/* Search, the type chips with their counts, and how many are shown. */}
          <div className="relative mt-[18px] flex h-[42px] items-center rounded-full border border-line pl-10 text-[14px] text-muted">
            <Icon d="M11 17.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM20 20l-4.4-4.4" className="absolute left-3.5 size-[17px]" />
            {m.search}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5 text-[13px] font-semibold">
            {m.chips.map(([label, n], i) => (
              <span
                key={label}
                className={`inline-flex items-center gap-1.5 rounded-full border px-[11px] py-1.5 ${i === 0 ? "border-fog bg-fog text-fg" : "border-line text-muted"}`}
              >
                {label}
                <small className="font-medium tabular-nums opacity-75">{n}</small>
              </span>
            ))}
          </div>
          <p className="mt-3.5 text-[12.5px] text-muted">{m.showing}</p>

          {/* Deleted posts, newest deletion first, in one bordered column as on x.com. */}
          <ol className="mt-2 overflow-hidden rounded-2xl border border-line">
            {m.items.map((post, i) => (
              <li key={post.id} className={`px-4 py-3 ${i ? "border-t border-line" : ""}`}>
                <div className="grid grid-cols-[40px_1fr] gap-3">
                  <span className="grid size-10 place-items-center rounded-full bg-fog text-[16px] font-bold text-muted" aria-hidden="true">
                    {handle[0].toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1 text-[15px] leading-5 text-muted">
                      <b className="font-bold whitespace-nowrap text-fg">{handle}</b>
                      <span className="whitespace-nowrap">@{handle}</span>
                      <span aria-hidden="true">·</span>
                      <span className="whitespace-nowrap">{post.date}</span>
                      <span className="-my-1.5 ml-auto grid size-[30px] shrink-0 place-items-center">
                        <Icon d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" className="size-[17px]" />
                      </span>
                    </div>
                    <p className="mt-0.5 text-[15px] leading-5 break-words">{post.text}</p>
                    <div className="mt-2.5 flex items-center justify-between gap-3 text-[13px] text-muted">
                      <span className="inline-flex items-center gap-1.5">
                        <Icon d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5" className="size-4" />
                        {post.deleted}
                      </span>
                      <span className="font-mono text-[11.5px]">{post.id}</span>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

const DOWNLOAD = "M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14";
// Chrome's extensions icon, a puzzle piece.
const PUZZLE =
  "M10 4.5a2 2 0 0 1 4 0V6h3.5a1 1 0 0 1 1 1v3.5H17a2 2 0 0 0 0 4h1.5V18a1 1 0 0 1-1 1H14v-1.5a2 2 0 0 0-4 0V19H6.5a1 1 0 0 1-1-1v-3.5H7a2 2 0 0 0 0-4H5.5V7a1 1 0 0 1 1-1H10z";

// A round toolbar button with one outline icon, as in Chrome's toolbar. `wide` ones only show when
// the window has room, as Chrome drops them in a narrow window.
function ChromeButton({ d, dim, wide }: { d: string; dim?: boolean; wide?: boolean }) {
  return (
    <span className={`${wide ? "hidden @min-[520px]:grid" : "grid"} size-[30px] shrink-0 place-items-center ${dim ? "opacity-40" : ""}`}>
      <Icon d={d} className="size-[18px]" width={1.9} />
    </span>
  );
}

function Icon({ d, className, width = 1.8 }: { d: string; className?: string; width?: number }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

// The page's round language flags: the chosen one in color, the other in grey.
export function Flag({ lang, on }: { lang: Locale; on: boolean }) {
  const look = `size-[18px] rounded-full shadow-[0_0_0_0.5px_var(--line)] ${on ? "" : "opacity-45 grayscale"}`;
  if (lang === "en")
    return (
      <svg viewBox="0 0 24 24" className={look} aria-hidden="true">
        <clipPath id="history-demo-us">
          <circle cx="12" cy="12" r="12" />
        </clipPath>
        <g clipPath="url(#history-demo-us)">
          <rect width="24" height="24" fill="#fff" />
          <path fill="#b22234" d="M0 0h24v1.85H0zM0 3.7h24v1.85H0zM0 7.4h24v1.85H0zM0 11.1h24v1.85H0zM0 14.8h24v1.85H0zM0 18.5h24v1.85H0zM0 22.15h24V24H0z" />
          <rect width="11" height="12.95" fill="#3c3b6e" />
        </g>
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" className={look} aria-hidden="true">
      <clipPath id="history-demo-br">
        <circle cx="12" cy="12" r="12" />
      </clipPath>
      <g clipPath="url(#history-demo-br)">
        <rect width="24" height="24" fill="#009c3b" />
        <path fill="#ffdf00" d="M12 4.2 21.6 12 12 19.8 2.4 12z" />
        <circle cx="12" cy="12" r="4.4" fill="#002776" />
        <path d="M7.8 11.1a9 9 0 0 1 8.3 2" stroke="#fff" strokeWidth="0.9" fill="none" />
      </g>
    </svg>
  );
}
