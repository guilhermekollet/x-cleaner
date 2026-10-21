import type { Ref } from "react";
import { Mark } from "./mark";
import { Flag } from "./history-demo";
import type { Dictionary, Locale } from "@/i18n/dictionaries";

// The extension's toolbar popup (src/popup.html), drawn faithfully for the hero's demo: laid out
// at its real width (POPUP_WIDTH) and sizes, in the site's black-and-white tokens (the popup uses
// the same palette), and zoomed down to fit the demo. "setup" is the popup as it opens; "running"
// and "done" are its progress view. The pace, batch and order icons are Phosphor's fill weight
// (MIT), like in the extension.

export const POPUP_WIDTH = 460;

type State = "setup" | "running" | "done";

export function PopupMock({
  dict,
  lang,
  state,
  deleted,
  pressing,
  startRef,
}: {
  dict: Dictionary;
  lang: Locale;
  state: State;
  deleted: number;
  pressing: boolean;
  startRef: Ref<HTMLSpanElement>;
}) {
  const e = dict.demo.ext;
  return (
    <div className="px-3.5 pt-3.5 pb-3 text-[14px] leading-[1.45] text-fg" style={{ width: POPUP_WIDTH }}>
      {/* Header: the mark and name, History, and the language flags. */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Mark className="size-[30px] text-fg" />
          <div>
            <p className="text-[17px] leading-[1.1] font-extrabold tracking-[-0.02em]">{e.open}</p>
            <p className="mt-0.5 text-[12px] text-muted">{e.tagline}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-flex h-[29px] items-center gap-[5px] rounded-full border border-line pr-2.5 pl-2 text-[12px] font-semibold">
            <Line d="M3.5 12a8.5 8.5 0 1 0 2.5-6M3.5 4v4h4M12 7.5V12l3 2" className="size-[15px]" />
            {e.history}
          </span>
          {(["en", "pt"] as const).map((l) => (
            <span key={l} className={`grid size-[26px] place-items-center rounded-full ${l === lang ? "shadow-[inset_0_0_0_1.5px_var(--fg)]" : ""}`}>
              <Flag lang={l} on={l === lang} />
            </span>
          ))}
        </div>
      </div>

      {state === "setup" ? (
        <div className="mt-[18px]">
          <Title>{e.sourceTitle}</Title>
          <div className="grid grid-cols-2 gap-2">
            <Choice on icon="M4 6h16M4 12h16M4 18h10" title={e.recent} hint={e.recentHint} />
            <Choice icon="M3.5 7.5h17v11a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2zM2.5 4h19v3.5h-19zM10 11.5h4" title={e.archive} hint={e.archiveHint} />
          </div>

          <Title className="mt-[18px]">{e.typesTitle}</Title>
          <div className="flex flex-wrap gap-1.5">
            {e.types.map((t, i) => (
              <span
                key={t}
                className={`inline-flex items-center gap-1.5 rounded-full border px-[11px] py-1.5 text-[13px] font-semibold ${
                  i < 3 ? "border-fog bg-fog text-fg" : "border-line text-muted"
                }`}
              >
                <i className={`size-[7px] rounded-full border-[1.5px] border-current ${i < 3 ? "bg-current" : ""}`} />
                {t}
              </span>
            ))}
          </div>

          <Title className="mt-[18px]">{e.howTitle}</Title>
          <div className="grid grid-cols-3 rounded-full bg-fog p-[3px]">
            {e.speeds.map((s, i) => (
              <span
                key={s}
                className={`flex items-center justify-center gap-1.5 rounded-full py-[7px] text-[13px] font-semibold ${
                  i === 1 ? "bg-bg text-fg shadow-[0_1px_3px_rgba(0,0,0,0.15)]" : "text-muted"
                }`}
              >
                <Fill d={[PH.walk, PH.run, PH.bolt][i]} className="size-[15px]" />
                {s}
              </span>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <SelectPill icon={PH.stack} label={e.batch} />
            <SelectPill icon={PH.sort} label={e.order} />
          </div>
          <p className="mt-2.5 flex items-center gap-1.5 py-1 text-[12.5px] font-semibold text-muted">
            {e.more} <span className="text-[16px] leading-none font-normal">+</span>
          </p>

          {/* "Test with 5 first", off: the user has run it before. */}
          <div className="mt-[18px] flex items-center justify-between gap-3 rounded-[14px] border border-line px-3.5 py-2.5">
            <b className="text-[13px]">{e.test}</b>
            <span className="relative h-[22px] w-[38px] rounded-full bg-line">
              <i className="absolute top-[3px] left-[3px] size-4 rounded-full bg-bg shadow-[0_1px_2px_rgba(0,0,0,0.25)]" />
            </span>
          </div>
          <span
            ref={startRef}
            className={`mt-2.5 flex h-11 items-center justify-center rounded-full bg-pill text-[15px] font-bold text-pill-fg transition-[scale] duration-150 ${
              pressing ? "scale-[0.97]" : ""
            }`}
          >
            {e.start}
          </span>
        </div>
      ) : (
        <div className="mt-[18px] rounded-[18px] border border-line bg-surface px-4 py-[18px]">
          <div className="grid grid-cols-3 gap-2">
            <Counter n={deleted} label={e.deleted} />
            <Counter n={0} label={e.gone} />
            <Counter n={0} label={e.failures} />
          </div>
          {/* Without a total (timeline mode) the bar just shows that it is working, as in the popup. */}
          <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-fog">
            <i
              className={`absolute inset-y-0 rounded-full bg-fg ${state === "done" ? "left-0 w-full" : "w-[35%] animate-[popup-mock-slide_1.4s_ease-in-out_infinite]"}`}
            />
          </div>
          <p className="mt-2.5 min-h-[19px] text-[13px] text-muted">{state === "done" ? e.done : e.working}</p>
          <div className="mt-3.5 flex gap-2 text-[14px] font-bold">
            {state === "done" ? (
              <span className="flex h-10 flex-1 items-center justify-center rounded-full bg-pill text-pill-fg">{e.again}</span>
            ) : (
              <>
                <span className="flex h-10 flex-1 items-center justify-center rounded-full border border-line">{e.pause}</span>
                <span className="flex h-10 flex-1 items-center justify-center rounded-full border border-line">{e.stop}</span>
              </>
            )}
          </div>
          <style>{`@keyframes popup-mock-slide { from { left: -35%; } to { left: 100%; } }`}</style>
        </div>
      )}
    </div>
  );
}

function Title({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`mb-2 text-[13px] font-bold tracking-[-0.005em] ${className}`}>{children}</p>;
}

function Choice({ on, icon, title, hint }: { on?: boolean; icon: string; title: string; hint: string }) {
  return (
    <span className={`flex flex-col gap-[3px] rounded-[14px] border px-3 py-2.5 ${on ? "border-fog bg-fog text-fg" : "border-line text-muted"}`}>
      <span className="flex items-center gap-[7px]">
        <Line d={icon} className="size-[17px]" />
        <b className="text-[13.5px]">{title}</b>
      </span>
      <small className="text-[11.5px] leading-[1.35] text-muted">{hint}</small>
    </span>
  );
}

function SelectPill({ icon, label }: { icon: string[]; label: string }) {
  return (
    <span className="relative flex h-9 items-center rounded-full border border-line pr-7 pl-[35px] text-[13px] font-semibold">
      <Fill d={icon} className="absolute left-3 size-4" />
      <span className="truncate">{label}</span>
      <Fill d={PH.caret} className="absolute right-3 size-[11px] text-muted" />
    </span>
  );
}

function Counter({ n, label }: { n: number; label: string }) {
  return (
    <span className="flex flex-col">
      <b className="text-[26px] leading-[1.1] font-extrabold tracking-[-0.02em] tabular-nums">{n}</b>
      <span className="text-[12px] text-muted">{label}</span>
    </span>
  );
}

function Line({ d, className }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function Fill({ d, className }: { d: string[]; className?: string }) {
  return (
    <svg viewBox="0 0 256 256" className={className} fill="currentColor" aria-hidden="true">
      {d.map((p) => (
        <path key={p} d={p} />
      ))}
    </svg>
  );
}

// Phosphor Icons, fill weight (MIT License, Copyright (c) 2023 Phosphor Icons).
const PH = {
  walk: ["M120,48a32,32,0,1,1,32,32A32,32,0,0,1,120,48Zm88,88c-28.64,0-41.81-13.3-55.75-27.37-3.53-3.57-7.18-7.26-11-10.58-37-32.14-96.22,22.73-98.72,25.08a8,8,0,0,0,10.95,11.66A163.88,163.88,0,0,1,84,113c13.78-7.38,25.39-10.23,34.7-8.58L64.66,228.81a8,8,0,0,0,4.15,10.52A7.84,7.84,0,0,0,72,240a8,8,0,0,0,7.34-4.81l33.59-77.27L144,180.12V232a8,8,0,0,0,16,0V176a8,8,0,0,0-3.35-6.51l-37.2-26.57L132.88,112c2.64,2.44,5.26,5.07,8,7.84C155.05,134.19,172.69,152,208,152a8,8,0,0,0,0-16Z"],
  run: ["M120,56a32,32,0,1,1,32,32A32,32,0,0,1,120,56Zm103.28,74.08a8,8,0,0,0-10.6-4c-.25.12-26.71,10.72-72.18-20.19-52.29-35.54-88-7.77-89.51-6.57a8,8,0,1,0,10,12.48c.26-.21,25.12-19.5,64.07,3.27-4.25,13.35-12.76,31.82-25.25,47-18.56,22.48-41.11,32.56-67,30A8,8,0,0,0,31.2,208a92.29,92.29,0,0,0,9.34.47c27.38,0,52-12.38,71.63-36.18.57-.69,1.14-1.4,1.69-2.1C133.31,175.29,168,190.3,168,232a8,8,0,0,0,16,0c0-24.65-10.08-45.35-29.15-59.86a104.29,104.29,0,0,0-31.31-15.81A169.31,169.31,0,0,0,139,124c26.14,16.09,46.84,20,60.69,20,12.18,0,19.06-3,19.67-3.28A8,8,0,0,0,223.28,130.08Z"],
  bolt: ["M213.85,125.46l-112,120a8,8,0,0,1-13.69-7l14.66-73.33L45.19,143.49a8,8,0,0,1-3-13l112-120a8,8,0,0,1,13.69,7L153.18,90.9l57.63,21.61a8,8,0,0,1,3,12.95Z"],
  stack: ["M220,169.09l-92,53.65L36,169.09A8,8,0,0,0,28,182.91l96,56a8,8,0,0,0,8.06,0l96-56A8,8,0,1,0,220,169.09Z", "M220,121.09l-92,53.65L36,121.09A8,8,0,0,0,28,134.91l96,56a8,8,0,0,0,8.06,0l96-56A8,8,0,1,0,220,121.09Z", "M28,86.91l96,56a8,8,0,0,0,8.06,0l96-56a8,8,0,0,0,0-13.82l-96-56a8,8,0,0,0-8.06,0l-96,56a8,8,0,0,0,0,13.82Z"],
  sort: ["M208,32H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM72,72h40a8,8,0,0,1,0,16H72a8,8,0,0,1,0-16Zm0,48h48a8,8,0,0,1,0,16H72a8,8,0,0,1,0-16Zm96,64H72a8,8,0,0,1,0-16h96a8,8,0,0,1,0,16Zm29.66-82.34a8,8,0,0,1-11.32,0L176,91.31V136a8,8,0,0,1-16,0V91.31l-10.34,10.35a8,8,0,0,1-11.32-11.32l24-24a8,8,0,0,1,11.32,0l24,24A8,8,0,0,1,197.66,101.66Z"],
  caret: ["M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,48,88H208a8,8,0,0,1,5.66,13.66Z"],
};
