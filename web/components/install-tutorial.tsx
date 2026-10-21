"use client";

import { useId, useState } from "react";
import { Mark } from "./mark";
import type { Dictionary } from "@/i18n/dictionaries";

// The install section: six steps, each with a picture of what the person will see. The pictures are
// drawn here, not screenshots — a recreation of Chrome's extensions page (in Chrome's dark theme,
// labels in the page's language, as Chrome shows them), a folder picker and an address bar — so
// they stay sharp and follow the site's language. The thing to click is ringed and pointed at.

type Install = Dictionary["install"];

// Chrome's dark theme, as on chrome://extensions.
const C = {
  page: "#202124",
  line: "#3c4043",
  field: "#2d2e31",
  card: "#292a2d",
  text: "#e3e3e3",
  sub: "#c4c7c5",
  blue: "#a8c7fa",
  blueLine: "#7c9fd6",
  navy: "#062e6f",
};

// A made-up id in the shape Chrome gives unpacked extensions (32 letters, a–p).
const FAKE_ID = "kfjdmhpgcaobnelhiklmgfpdcejbaonm";

export function InstallTutorial({ d, downloadUrl, downloadLabel, version }: { d: Install; downloadUrl: string; downloadLabel: string; version: string | null }) {
  const visuals = [
    <DownloadVisual key="0" url={downloadUrl} label={downloadLabel} />,
    <AddressVisual key="1" d={d} />,
    <ChromePage key="2" c={d.chrome} view="devMode" />,
    <ChromePage key="3" c={d.chrome} view="load" />,
    <FolderPicker key="4" c={d.chrome} />,
    <ChromePage key="5" c={d.chrome} view="installed" version={version} />,
  ];
  return (
    <ol className="relative">
      {d.steps.map((step, i) => (
        <li key={i} data-reveal className="relative grid grid-cols-[minmax(0,1fr)] gap-5 pb-14 last:pb-0 md:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] md:gap-10">
          {/* The thread joining the step numbers. */}
          {i < d.steps.length - 1 ? <span aria-hidden="true" className="absolute top-10 bottom-2 left-[17px] w-px bg-line md:bottom-0" /> : null}
          <div className="relative flex min-w-0 gap-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-bg font-mono text-sm font-semibold">{i + 1}</span>
            <div className="pt-1.5">
              <h3 className="text-lg font-bold tracking-[-0.015em]">{step.title}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-fg/60">{step.text}</p>
            </div>
          </div>
          <div className="min-w-0 pl-13 md:pl-0">{visuals[i]}</div>
        </li>
      ))}
    </ol>
  );
}

/* ---------- Step 1: the zip and the folder it turns into ---------- */
function DownloadVisual({ url, label }: { url: string; label: string }) {
  return (
    <div className="flex flex-col items-start gap-5 rounded-2xl border border-line bg-surface p-6 sm:flex-row sm:items-center">
      <a href={url} className="press inline-flex h-11 items-center gap-2 rounded-full bg-pill px-5 text-sm font-semibold whitespace-nowrap text-pill-fg">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
        </svg>
        {label}
      </a>
      <div className="flex items-center gap-3 font-mono text-[13px]">
        <FileChip kind="zip" name="x-cleaner.zip" />
        <svg viewBox="0 0 24 24" className="size-4 text-fg/40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
        <FileChip kind="folder" name="x-cleaner" />
      </div>
    </div>
  );
}

function FileChip({ kind, name }: { kind: "zip" | "folder"; name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-bg px-2.5 py-1.5">
      {kind === "folder" ? <FolderIcon className="size-4 text-[#5aa3e6]" /> : <ZipIcon className="size-4 text-fg/50" />}
      {name}
    </span>
  );
}

/* ---------- Step 2: the address to paste, with a copy button ---------- */
function AddressVisual({ d }: { d: Install }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <CopyRow value="chrome://extensions" d={d} />
      <div className="mt-3 flex items-center gap-3">
        <span className="w-16 shrink-0 text-xs text-fg/50">{d.edgeNote}</span>
        <CopyRow value="edge://extensions" d={d} small />
      </div>
    </div>
  );
}

function CopyRow({ value, d, small }: { value: string; d: Install; small?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked: the address is still there to select by hand */
    }
  }
  return (
    <div className={`flex flex-1 items-center gap-2 rounded-full bg-fog ${small ? "h-9 pr-1 pl-3.5" : "h-11 pr-1.5 pl-4"}`}>
      <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-fg/40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 8v4.5M12 15.5h.01" />
      </svg>
      <span className={`min-w-0 flex-1 truncate font-mono select-all ${small ? "text-[13px]" : "text-sm"}`}>{value}</span>
      <button
        type="button"
        onClick={copy}
        className={`press shrink-0 rounded-full font-semibold ${small ? "h-7 px-3 text-xs" : "h-8 px-4 text-sm"} ${copied ? "bg-fg/10 text-fg" : "bg-pill text-pill-fg"}`}
      >
        {copied ? `✓ ${d.copied}` : d.copy}
      </button>
    </div>
  );
}

/* ---------- Steps 3, 4 and 6: Chrome's extensions page ---------- */
function ChromePage({ c, view, version }: { c: Install["chrome"]; view: "devMode" | "load" | "installed"; version?: string | null }) {
  const devOn = view !== "devMode"; // step 3 shows it right as it's being switched on
  return (
    <div className="overflow-hidden rounded-2xl border border-line shadow-xl shadow-black/20" style={{ background: C.page, color: C.text }}>
      {/* Header: logo, title, search, Developer mode. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:gap-x-4">
        <ExtensionsLogo />
        <span className="text-[17px] font-medium whitespace-nowrap">{c.title}</span>
        <span className="hidden h-8 min-w-0 flex-1 items-center gap-2 rounded-full px-3 text-[12.5px] lg:flex" style={{ background: C.field, color: C.sub }}>
          <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4 4" />
          </svg>
          <span className="truncate">{c.search}</span>
        </span>
        <span className="ml-auto flex items-center gap-2.5 text-[12.5px] whitespace-nowrap lg:ml-0">
          {c.devMode}
          <Target on={view === "devMode"}>
            <Toggle on />
          </Target>
        </span>
      </div>

      {/* The developer buttons, there once Developer mode is on. */}
      {devOn ? (
        <div className="flex flex-wrap gap-2.5 border-b px-4 pb-3" style={{ borderColor: C.line }}>
          <Target on={view === "load"}>
            <ChromeButton>{c.load}</ChromeButton>
          </Target>
          <ChromeButton dim={view === "load"}>{c.pack}</ChromeButton>
          <ChromeButton dim={view === "load"}>{c.update}</ChromeButton>
        </div>
      ) : (
        <div className="border-b" style={{ borderColor: C.line }} />
      )}

      {/* The list, with X Cleaner installed. */}
      {view === "installed" ? (
        <div className="flex">
          <div className="hidden w-44 shrink-0 border-r py-2.5 sm:block" style={{ borderColor: C.line }}>
            <span className="mr-3 flex items-center gap-2.5 rounded-r-full py-2 pl-4 text-[12.5px] font-medium" style={{ background: C.blue, color: C.navy }}>
              <PuzzleIcon className="size-4" />
              {c.mine}
            </span>
            <span className="flex items-center gap-2.5 py-2 pl-4 text-[12.5px] font-medium">
              <KeyboardIcon className="size-4" />
              {c.shortcuts}
            </span>
          </div>
          <div className="min-w-0 flex-1 p-4">
            <p className="mb-3 text-[14px]">{c.all}</p>
            <div className="max-w-sm rounded-lg p-4 ring-2 ring-[#1d9bf0]/70" style={{ background: C.card }}>
              <div className="flex gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-md bg-black">
                  <Mark className="size-8 text-white" />
                </span>
                <div className="min-w-0">
                  <p className="text-[13.5px]">
                    X Cleaner {version ? <span style={{ color: C.sub }}>{version}</span> : null}
                  </p>
                  <p className="mt-1 text-[12px] leading-snug" style={{ color: C.sub }}>
                    {c.description}
                  </p>
                  <p className="mt-2 truncate text-[11px]" style={{ color: C.sub }}>
                    ID: {FAKE_ID}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <ChromeButton small>{c.details}</ChromeButton>
                <ChromeButton small>{c.remove}</ChromeButton>
                <svg viewBox="0 0 24 24" className="ml-auto size-4" fill="none" stroke={C.sub} strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M19 12a7 7 0 1 1-2.05-4.95M19 4v4h-4" />
                </svg>
                <Toggle on />
              </div>
            </div>
          </div>
        </div>
      ) : (
        // A hint of the page below, so the crop reads as Chrome's page and not a widget.
        <div className="flex h-12 items-center gap-3 px-4 opacity-40">
          <span className="h-2 w-24 rounded-full" style={{ background: C.line }} />
          <span className="h-2 w-40 rounded-full" style={{ background: C.line }} />
        </div>
      )}
    </div>
  );
}

function ChromeButton({ children, small, dim }: { children: React.ReactNode; small?: boolean; dim?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium whitespace-nowrap ${small ? "h-7 px-3 text-[11.5px]" : "h-8 px-3.5 text-[12.5px]"} ${dim ? "opacity-50" : ""}`}
      style={{ borderColor: C.blueLine, color: C.blue }}
    >
      {children}
    </span>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span className="relative inline-block h-[18px] w-8 rounded-full" style={{ background: on ? C.blue : C.line }}>
      <span className="absolute top-[3px] size-3 rounded-full transition-all" style={{ left: on ? 17 : 3, background: on ? C.navy : C.sub }} />
    </span>
  );
}

// Rings the thing to click and points the cursor at it.
function Target({ on, children }: { on: boolean; children: React.ReactNode }) {
  if (!on) return <>{children}</>;
  return (
    <span className="relative inline-flex">
      <span aria-hidden="true" className="tutorial-ring absolute -inset-1.5 rounded-full ring-2 ring-[#1d9bf0]" />
      {children}
      <svg viewBox="0 0 24 24" aria-hidden="true" className="pointer-events-none absolute top-[62%] left-[70%] z-10 size-5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
        <path d="M5 3l14 8.2-6.2 1.4 3.6 6.9-2.7 1.4-3.6-6.9L5 18.5z" fill="#fff" stroke="#000" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/* ---------- Step 5: the folder picker ---------- */
function FolderPicker({ c }: { c: Install["chrome"] }) {
  const rows = [
    { kind: "zip" as const, name: "x-cleaner.zip", selected: false },
    { kind: "folder" as const, name: "x-cleaner", selected: true },
  ];
  const inside = ["_locales", "fonts", "icons", "src", "manifest.json"];
  return (
    <div className="overflow-hidden rounded-2xl border border-line text-[12.5px] shadow-xl shadow-black/20" style={{ background: "#2b2b2d", color: "#e5e5e5" }}>
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5">
        <span className="flex gap-1.5" aria-hidden="true">
          <i className="size-2.5 rounded-full bg-[#ff5f57]" />
          <i className="size-2.5 rounded-full bg-[#febc2e]" />
          <i className="size-2.5 rounded-full bg-[#28c840]" />
        </span>
        <span className="mx-auto font-semibold">{c.picker.title}</span>
      </div>
      <div className="grid grid-cols-2">
        <div className="space-y-0.5 border-r border-white/10 p-2">
          {rows.map((r) => (
            <div key={r.name} className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${r.selected ? "bg-[#0a64d8] text-white" : "opacity-55"}`}>
              {r.kind === "folder" ? <FolderIcon className={`size-4 ${r.selected ? "text-white" : "text-[#5aa3e6]"}`} /> : <ZipIcon className="size-4" />}
              <span className="truncate">{r.name}</span>
              {r.kind === "folder" ? <span className="ml-auto opacity-70">›</span> : null}
            </div>
          ))}
        </div>
        <div className="space-y-0.5 p-2">
          {inside.map((name) => (
            <div key={name} className={`flex items-center gap-2 rounded-md px-2 py-1 ${name === "manifest.json" ? "bg-white/10" : ""}`}>
              {name.includes(".") ? <FileIcon className="size-3.5 opacity-70" /> : <FolderIcon className="size-3.5 text-[#5aa3e6]" />}
              <span className="truncate">{name}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-white/10 px-3 py-2.5">
        <span className="rounded-md bg-white/10 px-3 py-1">{c.picker.cancel}</span>
        <Target on>
          <span className="rounded-md bg-[#0a64d8] px-3 py-1 font-medium text-white">{c.picker.select}</span>
        </Target>
      </div>
    </div>
  );
}

/* ---------- Small icons ---------- */
// The Google Chrome logo, which chrome://extensions shows beside its title (the page shows the
// browser's own logo). Geometry from the public-domain SVG on Wikimedia Commons ("Google Chrome
// icon (February 2022)"); Chrome is a Google trademark, shown here only to depict its page.
function ExtensionsLogo() {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 48 48" className="size-7 shrink-0" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}a`} x1="3.2173" y1="15" x2="44.7812" y2="15" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#d93025" />
          <stop offset="1" stopColor="#ea4335" />
        </linearGradient>
        <linearGradient id={`${id}b`} x1="20.7219" y1="47.6791" x2="41.5039" y2="11.6837" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fcc934" />
          <stop offset="1" stopColor="#fbbc04" />
        </linearGradient>
        <linearGradient id={`${id}c`} x1="26.5981" y1="46.5015" x2="5.8161" y2="10.506" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1e8e3e" />
          <stop offset="1" stopColor="#34a853" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="23.9947" r="12" fill="#fff" />
      <path d="M24,12H44.7812a23.9939,23.9939,0,0,0-41.5639.0029L13.6079,30l.0093-.0024A11.9852,11.9852,0,0,1,24,12Z" fill={`url(#${id}a)`} />
      <circle cx="24" cy="24" r="9.5" fill="#1a73e8" />
      <path d="M34.3913,30.0029,24.0007,48A23.994,23.994,0,0,0,44.78,12.0031H23.9989l-.0025.0093A11.985,11.985,0,0,1,34.3913,30.0029Z" fill={`url(#${id}b)`} />
      <path d="M13.6086,30.0031,3.218,12.006A23.994,23.994,0,0,0,24.0025,48L34.3931,30.0029l-.0067-.0068a11.9852,11.9852,0,0,1-20.7778.007Z" fill={`url(#${id}c)`} />
    </svg>
  );
}
function PuzzleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 8h3.5a2 2 0 1 1 4 0H16v3.5a2 2 0 1 1 0 4V19H5z" />
    </svg>
  );
}
function KeyboardIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <rect x="3" y="6.5" width="18" height="11" rx="2" />
      <path d="M7 10h.01M10 10h.01M13 10h.01M16 10h.01M8 14h8" />
    </svg>
  );
}
function FolderIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h5l2 2.2h8A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" />
    </svg>
  );
}
function ZipIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M11 6h1M11 8.5h1M11 11h1M10.5 13.5h2v3h-2z" />
    </svg>
  );
}
function FileIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
    </svg>
  );
}
