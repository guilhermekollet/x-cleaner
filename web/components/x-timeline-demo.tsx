"use client";

import { useEffect, useRef, useState } from "react";
import { Mark } from "./mark";
import type { Dictionary, Locale } from "@/i18n/dictionaries";

// A looping, illustrative mock of an X profile in the shape of x.com's own column: a cursor opens a
// post's "more" menu, picks Delete, confirms in the "Delete post?" dialog, and the post leaves the
// timeline while the toast, the post count and the X Cleaner badge update. It deletes nothing.
// Icons are drawn here as simple outlines, not taken from X. With reduced motion it stays still.

type Phase = "idle" | "hoverMore" | "menu" | "hoverDelete" | "confirm" | "hoverConfirm" | "pressed" | "removing";

const START_COUNT = 2481;

export function XTimelineDemo({ dict, lang }: { dict: Dictionary; lang: Locale }) {
  const d = dict.demo;
  const total = d.items.length;
  const [start, setStart] = useState(0); // index of the post at the top of the timeline
  const [phase, setPhase] = useState<Phase>("idle");
  const [deleted, setDeleted] = useState(0);
  const [toast, setToast] = useState(false);
  const [cursor, setCursor] = useState({ x: 0, y: 0, shown: false, down: false });

  const cardRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLSpanElement>(null);
  const deleteRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLSpanElement>(null);

  // Moves the cursor's tip to the middle of an element, in the card's coordinates.
  function pointAt(el: HTMLElement | null, dx = 0, dy = 0) {
    const card = cardRef.current;
    if (!el || !card) return;
    const c = card.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    setCursor((s) => ({ ...s, shown: true, x: r.left - c.left + r.width / 2 + dx, y: r.top - c.top + r.height / 2 + dy }));
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
      // Park the cursor low on the right before the first pass.
      const card = cardRef.current;
      if (card) setCursor({ x: card.clientWidth - 60, y: card.clientHeight - 70, shown: true, down: false });
      await wait(900);

      let top = 0;
      while (alive) {
        if (top >= total) {
          // Everything is gone: hold the empty timeline, then start over.
          setCursor((s) => ({ ...s, x: (cardRef.current?.clientWidth ?? 300) - 60, y: (cardRef.current?.clientHeight ?? 400) - 70 }));
          await wait(2600);
          if (!alive) return;
          setStart(0);
          setDeleted(0);
          top = 0;
          await wait(900);
          continue;
        }

        setPhase("idle");
        pointAt(moreRef.current);
        await wait(700);
        if (!alive) return;
        setPhase("hoverMore");
        await wait(250);
        await click();
        setPhase("menu");
        await wait(350);
        pointAt(deleteRef.current, -40);
        await wait(550);
        if (!alive) return;
        setPhase("hoverDelete");
        await wait(300);
        await click();
        setPhase("confirm");
        await wait(500);
        pointAt(confirmRef.current);
        await wait(600);
        if (!alive) return;
        setPhase("hoverConfirm");
        await wait(300);
        await click();
        setPhase("pressed");
        await wait(120);
        setPhase("removing");
        setToast(true);
        setDeleted((n) => n + 1);
        timers.push(setTimeout(() => alive && setToast(false), 2000));
        await wait(480);
        if (!alive) return;
        top += 1;
        setStart(top);
        setPhase("idle");
        await wait(500);
      }
    })();

    return () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
    // The loop reads refs and stable values only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const count = new Intl.NumberFormat(lang === "pt" ? "pt-BR" : "en-US").format(START_COUNT - deleted);
  const menuOpen = phase === "menu" || phase === "hoverDelete";
  const dialogOpen = phase === "confirm" || phase === "hoverConfirm" || phase === "pressed";

  return (
    <div
      ref={cardRef}
      role="img"
      aria-label={d.label}
      className="relative h-[540px] w-full max-w-[440px] overflow-hidden rounded-2xl border border-line bg-bg text-[15px] leading-5 shadow-2xl shadow-black/20 select-none"
    >
      {/* Profile header: back arrow, name and the post count, as on x.com. */}
      <div className="flex h-[53px] items-center gap-6 px-4">
        <Icon d="M19 12H5M11 18l-6-6 6-6" className="size-5" />
        <div className="min-w-0">
          <p className="truncate text-[17px] leading-6 font-bold">{d.name}</p>
          <p className="text-[13px] leading-4 text-muted tabular-nums">
            {count} {d.posts}
          </p>
        </div>
        {/* The extension's own badge, counting what it removed. */}
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs font-semibold">
          <Mark className="size-3.5 text-fg" />
          <span className="tabular-nums">{deleted}</span>
          <span className="font-normal text-muted">{d.badge}</span>
        </span>
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
      <div className="relative">
        {d.items.map((post, i) => {
          if (i < start) return null;
          const isTop = i === start;
          const collapsing = isTop && phase === "removing";
          return (
            <div
              key={i}
              className="grid transition-[grid-template-rows,opacity] duration-[450ms] ease-out"
              style={{ gridTemplateRows: collapsing ? "0fr" : "1fr", opacity: collapsing ? 0 : 1 }}
            >
              <div className="overflow-hidden">
                <article className="flex gap-3 border-b border-line px-4 pt-3 pb-2">
                  <Avatar />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="truncate font-bold">{d.name}</span>
                      <span className="truncate text-muted">
                        {d.handle} · {post.time}
                      </span>
                      <span
                        ref={isTop ? moreRef : undefined}
                        className={`-my-2 -mr-2 ml-auto grid size-[34px] shrink-0 place-items-center rounded-full transition-colors ${
                          isTop && (phase === "hoverMore" || menuOpen) ? "bg-accent/10 text-accent" : "text-muted"
                        }`}
                      >
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

        {/* The "more" menu, anchored where X opens it: over the top-right of the post. */}
        {menuOpen ? (
          <div className="absolute top-2 right-3 z-10 w-[260px] overflow-hidden rounded-xl bg-bg py-1 shadow-[0_0_15px_rgba(101,119,134,0.2),0_0_3px_1px_rgba(101,119,134,0.15)] dark:shadow-[0_0_15px_rgba(255,255,255,0.2),0_0_3px_1px_rgba(255,255,255,0.15)]">
            <div
              ref={deleteRef}
              className={`flex items-center gap-3 px-4 py-3 font-bold text-danger transition-colors ${phase === "hoverDelete" ? "bg-fg/[0.06]" : ""}`}
            >
              <Icon d={ICONS.trash} className="size-[18px]" />
              {d.menu.delete}
            </div>
            <MenuRow d={ICONS.pin} label={d.menu.pin} />
            <MenuRow d={ICONS.highlights} label={d.menu.highlights} />
            <MenuRow d={ICONS.views} label={d.menu.activity} />
          </div>
        ) : null}

        {/* After the last post: an empty timeline. */}
        {start >= total ? <div className="h-40" /> : null}
      </div>

      {/* The "Delete post?" dialog over a dimmed page. */}
      <div
        className={`absolute inset-0 z-20 grid place-items-center bg-[rgba(0,0,0,0.4)] px-6 transition-opacity duration-200 dark:bg-[rgba(91,112,131,0.4)] ${
          dialogOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <div className="w-full max-w-[320px] rounded-2xl bg-bg p-8">
          <p className="text-xl leading-6 font-bold">{d.confirm.title}</p>
          <p className="mt-2 text-[15px] leading-5 text-muted">{d.confirm.text}</p>
          <span
            ref={confirmRef}
            className={`mt-6 flex h-11 items-center justify-center rounded-full font-bold text-white transition-[filter,scale] ${
              phase === "pressed" ? "scale-[0.98] brightness-90" : phase === "hoverConfirm" ? "brightness-95" : ""
            } bg-danger`}
          >
            {d.confirm.delete}
          </span>
          <span className="mt-3 flex h-11 items-center justify-center rounded-full border border-line font-bold">{d.confirm.cancel}</span>
        </div>
      </div>

      {/* X's blue toast at the bottom. */}
      <div
        className={`absolute inset-x-0 bottom-5 z-30 flex justify-center transition-all duration-300 ${
          toast ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
        }`}
      >
        <span className="rounded-md bg-accent px-4 py-3 text-[15px] text-white shadow-lg">{d.toast}</span>
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
  trash: "M4 6.5h16M9.5 6.5V4h5v2.5M6 6.5l1 13.5a1.5 1.5 0 0 0 1.5 1.4h7a1.5 1.5 0 0 0 1.5-1.4L18 6.5M10 10.5v7M14 10.5v7",
  pin: "M9 3.5h6l-1 6.5 4 3.5H6l4-3.5zM12 13.5v7",
  highlights: "M12 3l2.2 5.3L19.5 10l-5.3 2.2L12 17.5l-2.2-5.3L4.5 10l5.3-1.7z",
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

function MenuRow({ d, label }: { d: string; label: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 font-bold">
      <Icon d={d} className="size-[18px] shrink-0" />
      <span className="truncate">{label}</span>
    </div>
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
