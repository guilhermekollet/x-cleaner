"use client";

import { useEffect, useRef, useState } from "react";
import { Mark } from "./mark";
import type { Dictionary } from "@/i18n/dictionaries";

// A looping mock of the extension's popup: a short list of posts gets crossed out and swept away
// one at a time while the "deleted" counter climbs, then it resets. It illustrates the tool; it
// deletes nothing. Respects prefers-reduced-motion by showing a finished state.
const SAMPLE = [
  { kind: "post", text: "gm, shipping something new today" },
  { kind: "reply", text: "@someone haha exactly this" },
  { kind: "repost", text: "reposted a thread about design" },
  { kind: "post", text: "hot take nobody asked for" },
  { kind: "reply", text: "@friend see you there 🫡" },
  { kind: "post", text: "deleting my old timeline" },
];

export function PopupDemo({ dict }: { dict: Dictionary }) {
  const [deleted, setDeleted] = useState(0);
  const [removing, setRemoving] = useState<number | null>(null);
  const [cleared, setCleared] = useState<Set<number>>(new Set());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setDeleted(SAMPLE.length);
      setCleared(new Set(SAMPLE.map((_, i) => i)));
      return;
    }
    let i = 0;
    const tick = () => {
      if (i >= SAMPLE.length) {
        timers.current.push(
          setTimeout(() => {
            setCleared(new Set());
            setDeleted(0);
            i = 0;
            timers.current.push(setTimeout(tick, 900));
          }, 2600)
        );
        return;
      }
      const idx = i;
      setRemoving(idx);
      timers.current.push(
        setTimeout(() => {
          setCleared((prev) => new Set(prev).add(idx));
          setDeleted((n) => n + 1);
          setRemoving(null);
          i += 1;
          timers.current.push(setTimeout(tick, 650));
        }, 650)
      );
    };
    timers.current.push(setTimeout(tick, 900));
    return () => timers.current.forEach(clearTimeout);
  }, []);

  const kindLabel: Record<string, string> = {
    post: "Post",
    reply: "Reply",
    repost: "Repost",
  };

  return (
    <div className="w-full max-w-[340px] overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl shadow-black/20">
      {/* Title bar */}
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <Mark className="size-5 text-fg" animated />
        <span className="font-semibold">{dict.demo.title}</span>
      </div>

      {/* Counters */}
      <div className="flex items-center justify-between px-4 pt-4 text-sm">
        <span>
          <b className="text-xl text-ok tabular-nums">{deleted}</b> {dict.demo.deleted}
        </span>
        <span>
          <b className="text-xl tabular-nums">0</b> {dict.demo.gone}
        </span>
        <span>
          <b className="text-xl tabular-nums">0</b> {dict.demo.failures}
        </span>
      </div>
      <p className="px-4 pt-1 pb-3 text-xs text-fg/50">{dict.demo.status}</p>

      {/* Post list */}
      <div className="space-y-1.5 px-3 pb-4">
        {SAMPLE.map((item, i) => {
          const isCleared = cleared.has(i);
          const isRemoving = removing === i;
          return (
            <div
              key={i}
              className="flex items-center gap-2 rounded-lg border border-line/70 bg-mist px-3 text-xs transition-all duration-500"
              style={{
                height: isCleared ? 0 : 34,
                opacity: isCleared ? 0 : 1,
                paddingTop: isCleared ? 0 : undefined,
                paddingBottom: isCleared ? 0 : undefined,
                marginTop: isCleared ? 0 : undefined,
                borderWidth: isCleared ? 0 : undefined,
                transform: isRemoving ? "translateX(14px)" : "none",
              }}
            >
              <span className="shrink-0 rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                {kindLabel[item.kind]}
              </span>
              <span className={`truncate text-fg/70 ${isRemoving ? "line-through" : ""}`}>{item.text}</span>
            </div>
          );
        })}
      </div>

      <p className="border-t border-line px-4 py-2.5 text-[11px] text-fg/40">{dict.demo.caption}</p>
    </div>
  );
}
