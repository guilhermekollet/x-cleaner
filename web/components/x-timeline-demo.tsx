"use client";

import { useEffect, useRef, useState } from "react";
import { Mark } from "./mark";
import type { Dictionary, Locale } from "@/i18n/dictionaries";

// A looping, illustrative mock: a browser window on an X profile, in the shape of x.com's own
// column. The cursor only opens X Cleaner from the toolbar and presses Start; from then on the
// extension does the work, removing the posts one at a time while its popup counts them and the
// profile's post count drops. It deletes nothing. Icons are simple outlines drawn here, not X's.
// With reduced motion it stays still.

type Popup = "closed" | "ready" | "running" | "done";

const START_COUNT = 2481;

export function XTimelineDemo({ dict, lang }: { dict: Dictionary; lang: Locale }) {
  const d = dict.demo;
  const e = d.ext;
  const total = d.items.length;
  const [start, setStart] = useState(0); // index of the post at the top of the timeline
  const [removing, setRemoving] = useState<number | null>(null); // post being swept out
  const [popup, setPopup] = useState<Popup>("closed");
  const [hoverStart, setHoverStart] = useState(false);
  const [deleted, setDeleted] = useState(0);
  const [cursor, setCursor] = useState({ x: 0, y: 0, shown: false, down: false });

  const cardRef = useRef<HTMLDivElement>(null);
  const extRef = useRef<HTMLSpanElement>(null);
  const startRef = useRef<HTMLSpanElement>(null);

  // Moves the cursor's tip to the middle of an element, in the card's coordinates.
  function pointAt(el: HTMLElement | null) {
    const card = cardRef.current;
    if (!el || !card) return;
    const c = card.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    setCursor((s) => ({ ...s, shown: true, x: r.left - c.left + r.width / 2, y: r.top - c.top + r.height / 2 }));
  }
  function park() {
    const card = cardRef.current;
    if (card) setCursor((s) => ({ ...s, x: card.clientWidth * 0.35, y: card.clientHeight - 60 }));
  }

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const wait = (ms: number) => new Promise<void>((r) => timers.push(setTimeout(r, ms)));
    const click = async () => {
      setCursor((s) => ({ ...s, down: true }));
      await wait(140);
      setCursor((s) => ({ ...s, down: false }));
    };

    (async () => {
      park();
      setCursor((s) => ({ ...s, shown: true }));
      await wait(800);
      while (alive) {
        // Open the extension from the toolbar.
        pointAt(extRef.current);
        await wait(750);
        if (!alive) return;
        await click();
        setPopup("ready");
        await wait(500);

        // Press Start.
        pointAt(startRef.current);
        await wait(700);
        if (!alive) return;
        setHoverStart(true);
        await wait(250);
        await click();
        setHoverStart(false);
        setPopup("running");

        // Hands off: the cursor steps aside and the extension works on its own.
        await wait(300);
        park();
        await wait(400);
        setCursor((s) => ({ ...s, shown: false }));

        for (let i = 0; i < total && alive; i++) {
          await wait(450);
          setRemoving(i);
          await wait(520);
          if (!alive) return;
          setDeleted((n) => n + 1);
          setStart(i + 1);
          setRemoving(null);
        }
        if (!alive) return;
        setPopup("done");
        await wait(2800);
        if (!alive) return;

        // Close the popup and put the posts back for the next pass.
        setPopup("closed");
        await wait(400);
        setStart(0);
        setDeleted(0);
        park();
        setCursor((s) => ({ ...s, shown: true }));
        await wait(900);
      }
    })();

    return () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
    // The loop reads refs and stable values only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fmt = new Intl.NumberFormat(lang === "pt" ? "pt-BR" : "en-US");
  const running = popup === "running";
  const finished = popup === "done";

  return (
    <div
      ref={cardRef}
      role="img"
      aria-label={d.label}
      className="relative h-[560px] w-full max-w-[460px] overflow-hidden rounded-2xl border border-line bg-bg text-[15px] leading-5 shadow-2xl shadow-black/20 select-none"
    >
      {/* Browser toolbar: window buttons, the address, and the extension's icon. */}
      <div className="flex h-11 items-center gap-3 border-b border-line bg-mist px-3">
        <span className="flex gap-1.5" aria-hidden="true">
          <i className="size-2.5 rounded-full bg-[#ff5f57]" />
          <i className="size-2.5 rounded-full bg-[#febc2e]" />
          <i className="size-2.5 rounded-full bg-[#28c840]" />
        </span>
        <span className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-full bg-fog px-3 text-[13px] text-muted">
          <Icon d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z" className="size-3 shrink-0" />
          <span className="truncate">{e.address}</span>
        </span>
        <span
          ref={extRef}
          className={`grid size-7 shrink-0 place-items-center rounded-md transition-colors ${popup !== "closed" ? "bg-fg/10" : ""}`}
        >
          <Mark className="size-[18px] text-fg" />
        </span>
      </div>

      {/* Profile header: back arrow, name and the post count, as on x.com. */}
      <div className="flex h-[53px] items-center gap-6 px-4">
        <Icon d="M19 12H5M11 18l-6-6 6-6" className="size-5" />
        <div className="min-w-0">
          <p className="truncate text-[17px] leading-6 font-bold">{d.name}</p>
          <p className="text-[13px] leading-4 text-muted tabular-nums">
            {fmt.format(START_COUNT - deleted)} {d.posts}
          </p>
        </div>
      </div>

      {/* Tabs, Posts selected. */}
      <div className="flex border-b border-line">
        {d.tabs.map((tab, i) => (
          <div key={tab} className="flex flex-1 justify-center">
            <span className={`relative py-4 text-[15px] ${i === 0 ? "font-bold" : "font-medium text-muted"}`}>
              {tab}
              {i === 0 ? <span className="absolute inset-x-0 bottom-0 h-1 rounded-full bg-accent" /> : null}
            </span>
          </div>
        ))}
      </div>

      {/* Timeline */}
      <div>
        {d.items.map((post, i) => {
          if (i < start) return null;
          const out = removing === i;
          return (
            <div
              key={i}
              className="grid transition-[grid-template-rows,opacity] duration-[480ms] ease-out"
              style={{ gridTemplateRows: out ? "0fr" : "1fr", opacity: out ? 0 : 1 }}
            >
              <div className="overflow-hidden">
                <article
                  className={`flex gap-3 border-b border-line px-4 pt-3 pb-2 transition-colors duration-200 ${out ? "bg-danger/10" : ""}`}
                >
                  <Avatar />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="truncate font-bold">{d.name}</span>
                      <span className="truncate text-muted">
                        {d.handle} · {post.time}
                      </span>
                      <span className="-my-2 -mr-2 ml-auto grid size-[34px] shrink-0 place-items-center text-muted">
                        <MoreIcon />
                      </span>
                    </div>
                    <p className="mt-0.5 break-words">{post.text}</p>
                    <div className="mt-3 flex max-w-[400px] justify-between text-[13px] text-muted">
                      <Action d={ICONS.reply} n={post.replies} />
                      <Action d={ICONS.repost} n={post.reposts} />
                      <Action d={ICONS.like} n={post.likes} />
                      <Action d={ICONS.views} n={post.views} />
                      <span className="flex items-center gap-3">
                        <Icon d={ICONS.bookmark} className="size-[18px]" />
                        <Icon d={ICONS.share} className="size-[18px]" />
                      </span>
                    </div>
                  </div>
                </article>
              </div>
            </div>
          );
        })}
        {start >= total ? <p className="py-16 text-center text-[15px] font-bold text-muted">{e.empty}</p> : null}
      </div>

      {/* The extension's popup, dropped from the toolbar icon like Chrome opens it. */}
      <div
        className={`absolute top-[46px] right-2 z-20 w-[248px] origin-top-right rounded-xl border border-[#2a2a2a] bg-[#0f0f0f] p-3 text-[13px] text-[#f5f5f5] shadow-2xl shadow-black/40 transition-[opacity,scale] duration-200 ${
          popup === "closed" ? "pointer-events-none scale-95 opacity-0" : "scale-100 opacity-100"
        }`}
      >
        <div className="flex items-center gap-2">
          <Mark className="size-4 text-[#f5f5f5]" />
          <span className="font-bold">{e.open}</span>
        </div>

        {popup === "ready" ? (
          <>
            <p className="mt-3 mb-1.5 font-semibold">{e.what}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {e.types.map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5">
                  <span className="grid size-3.5 place-items-center rounded-[3px] bg-accent">
                    <Icon d="M5 12l5 5 9-10" className="size-2.5 text-white" />
                  </span>
                  {t}
                </span>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[#9a9a9a]">{e.speed}</span>
              <span className="rounded-md border border-[#2a2a2a] bg-[#0c0c0c] px-2 py-0.5">{e.speedValue}</span>
            </div>
            <span
              ref={startRef}
              className={`mt-3 flex h-9 items-center justify-center rounded-lg bg-[#f4212e] font-semibold text-white transition-[filter] ${
                hoverStart ? "brightness-110" : ""
              }`}
            >
              {e.start}
            </span>
          </>
        ) : (
          <>
            <div className="mt-3 flex justify-between">
              <Counter n={deleted} label={e.deleted} className="text-[#7ee081]" />
              <Counter n={0} label={e.gone} />
              <Counter n={0} label={e.failures} className="text-[#f4212e]" />
            </div>
            <p className="mt-2 text-[12px] text-[#9a9a9a]">
              {finished ? e.done : `${e.working} ${Math.min(deleted + 1, total)} ${e.of} ${total}…`}
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#2a2a2a]">
              <div
                className="h-full rounded-full bg-[#b8a4f8] transition-[width] duration-500"
                style={{ width: `${(deleted / total) * 100}%` }}
              />
            </div>
          </>
        )}
      </div>

      {/* The cursor. Its tip sits at (x, y). */}
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-0 z-40 size-6 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)] transition-[translate,opacity,scale] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{
          translate: `${cursor.x - 5}px ${cursor.y - 3}px`,
          opacity: cursor.shown ? 1 : 0,
          scale: cursor.down ? 0.85 : 1,
        }}
      >
        <path d="M5 3l14 8.2-6.2 1.4 3.6 6.9-2.7 1.4-3.6-6.9L5 18.5z" fill="#fff" stroke="#000" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// Simple outline icons in the spirit of X's, drawn for this demo.
const ICONS = {
  reply: "M4.5 11.5a7 7 0 0 1 7-7h1a7 7 0 0 1 0 14h-.5L7 21.5v-3.6a7 7 0 0 1-2.5-6.4z",
  repost: "M17 3.5l3 3-3 3M20 6.5H9a3.5 3.5 0 0 0-3.5 3.5v1M7 20.5l-3-3 3-3M4 17.5h11a3.5 3.5 0 0 0 3.5-3.5v-1",
  like: "M12 20s-7.5-4.6-9.2-9C1.6 7.6 3.8 4.5 7 4.5c2.1 0 3.6 1.2 5 3 1.4-1.8 2.9-3 5-3 3.2 0 5.4 3.1 4.2 6.5C19.5 15.4 12 20 12 20z",
  views: "M5 20v-6M10 20V9M15 20V4M20 20v-9",
  bookmark: "M6.5 3.5h11v17l-5.5-4-5.5 4z",
  share: "M12 15V3.5M7.5 8 12 3.5 16.5 8M4.5 14v4.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V14",
};

function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

function Action({ d, n }: { d: string; n: string }) {
  return (
    <span className="flex items-center gap-1">
      <Icon d={d} className="size-[18px]" />
      <span className="min-w-[1ch] tabular-nums">{n}</span>
    </span>
  );
}

function Counter({ n, label, className = "" }: { n: number; label: string; className?: string }) {
  return (
    <span className="flex flex-col items-start">
      <b className={`text-lg leading-6 tabular-nums ${className}`}>{n}</b>
      <span className="text-[11px] text-[#9a9a9a]">{label}</span>
    </span>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px]" fill="currentColor">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

// A generic avatar: a person silhouette on a neutral circle, like a profile with no photo.
function Avatar() {
  return (
    <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-fog">
      <svg viewBox="0 0 40 40" aria-hidden="true" className="size-10 text-muted">
        <circle cx="20" cy="16" r="7" fill="currentColor" />
        <path d="M6 38c1.5-7.5 7.2-11.5 14-11.5S32.5 30.5 34 38z" fill="currentColor" />
      </svg>
    </div>
  );
}
