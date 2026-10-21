"use client";

import { useEffect, useRef, useState } from "react";
import { Mark } from "./mark";
import type { Dictionary, Locale } from "@/i18n/dictionaries";

// A still, faithful mock of the extension's history page (src/history.html) as it opens in a
// browser tab: the page's header with the language flags, the title and privacy note, the count
// with "Download JSON", "Download CSV" and "Clear history", the search, the type chips with their
// counts, and the deleted posts drawn the way the page draws them (like posts on x.com). It is laid
// out at the page's own width (PAGE_WIDTH) and zoomed to the frame's width, like a screenshot, so
// the proportions match. The six
// posts are the hero's fictional ones, as if just deleted. Nothing here is real data.

const PAGE_WIDTH = 680;

export function HistoryDemo({ dict, lang }: { dict: Dictionary; lang: Locale }) {
  const m = dict.history.mock;
  const handle = dict.demo.handle.replace(/^@/, "");
  const frameRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.68);

  // Follows the frame's width, so the page always fills it edge to edge.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const fit = () => setZoom(el.clientWidth / PAGE_WIDTH);
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
      className="relative w-full max-w-[560px] overflow-hidden rounded-2xl border border-line bg-bg shadow-2xl shadow-black/20 select-none"
    >
      {/* Browser toolbar: window buttons and the extension page's address. */}
      <div className="flex h-11 items-center gap-3 border-b border-line bg-mist px-3">
        <span className="flex gap-1.5" aria-hidden="true">
          <i className="size-2.5 rounded-full bg-[#ff5f57]" />
          <i className="size-2.5 rounded-full bg-[#febc2e]" />
          <i className="size-2.5 rounded-full bg-[#28c840]" />
        </span>
        <span className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-full bg-fog px-3 text-[13px] text-muted">
          <Mark className="size-3.5 shrink-0 text-fg" />
          <span className="shrink-0 text-fg">X Cleaner</span>
          <span className="truncate">| {m.address}</span>
        </span>
      </div>

      {/* The page, at its own sizes, zoomed to the frame. The list fades out at the bottom, as a
          cropped screenshot would. */}
      <div className="aspect-[6/7] overflow-hidden [mask-image:linear-gradient(to_bottom,black_80%,transparent)]">
        <div className="px-5 pt-6 text-[14px] leading-[1.45] text-fg" style={{ width: PAGE_WIDTH, zoom }}>
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

function Icon({ d, className, width = 1.8 }: { d: string; className?: string; width?: number }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

// The page's round language flags: the chosen one in color, the other in grey.
function Flag({ lang, on }: { lang: Locale; on: boolean }) {
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
