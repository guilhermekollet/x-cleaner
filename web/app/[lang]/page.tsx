import { notFound } from "next/navigation";
import { getDictionary, hasLocale, locales } from "@/i18n/dictionaries";
import { Mark, GithubLogo } from "@/components/mark";
import { HeaderMenu } from "@/components/header-menu";
import { RevealObserver } from "@/components/motion-bits";
import { XTimelineDemo } from "@/components/x-timeline-demo";

const REPO_SLUG = "guilhermekollet/x-cleaner";
const REPO_URL = `https://github.com/${REPO_SLUG}`;
// The release workflow attaches the extension under this stable name, so the link always
// downloads the newest version.
const DOWNLOAD_URL = `${REPO_URL}/releases/latest/download/x-cleaner.zip`;

const after = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;
const pill = "press inline-flex items-center justify-center gap-2 rounded-full px-5 h-11 text-sm font-semibold whitespace-nowrap";
const sectionTitle = "text-[clamp(28px,4vw,40px)] leading-[1.1] font-bold tracking-[-0.025em]";
const card = "rounded-2xl border border-line bg-surface p-6";

// Stars and forks, read once at build time. The site is static, so they are as fresh as the last
// deploy; if GitHub can't be reached the counts are simply left out.
async function repoStats(): Promise<{ stars: number; forks: number } | null> {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO_SLUG}`, {
      headers: { accept: "application/vnd.github+json" },
      cache: "force-cache",
    });
    if (!r.ok) return null;
    const j = await r.json();
    return { stars: j.stargazers_count ?? 0, forks: j.forks_count ?? 0 };
  } catch {
    return null;
  }
}

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

function SectionHead({ title, text }: { title: string; text?: string }) {
  return (
    <div data-reveal className="mx-auto mb-12 max-w-[640px] text-center">
      <h2 className={sectionTitle}>{title}</h2>
      {text ? <p className="mt-4 text-[17px] leading-relaxed text-fg/60">{text}</p> : null}
    </div>
  );
}

export default async function Page({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const d = getDictionary(lang);
  const stats = await repoStats();

  return (
    <>
      <RevealObserver />

      {/* Header: just the mark and the download. Language and theme live in the footer. */}
      <header className="sticky top-0 z-50 bg-bg/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <a href="#top" className="flex items-center gap-2 font-semibold">
            <Mark className="size-7 text-fg" />
            <span>X Cleaner</span>
          </a>
          <a href={DOWNLOAD_URL} className={`${pill} h-10 bg-pill text-pill-fg`}>
            <DownloadIcon />
            {d.download}
          </a>
        </div>
      </header>

      <main id="top">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 md:grid-cols-2 md:py-28">
            <div>
              <p className="rise inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs font-medium text-fg/60" style={after(0)}>
                <Mark className="size-4 text-accent" />
                {d.hero.eyebrow}
              </p>
              <h1 className="rise mt-5 text-[clamp(40px,6.5vw,68px)] leading-[1.02] font-extrabold tracking-[-0.04em]" style={after(80)}>
                {d.hero.title}
              </h1>
              <p className="rise mt-5 max-w-[30rem] text-[18px] leading-relaxed text-fg/70" style={after(160)}>
                {d.hero.text}
              </p>
              <div className="rise mt-8 flex flex-wrap gap-3" style={after(240)}>
                <a href={DOWNLOAD_URL} className={`${pill} bg-accent text-white`}>
                  <DownloadIcon />
                  {d.download}
                </a>
                <a href="#what" className={`${pill} border border-line text-fg`}>
                  {d.hero.see}
                </a>
              </div>
            </div>
            <div className="rise flex justify-center md:justify-end" style={after(320)}>
              <XTimelineDemo dict={d} lang={lang} />
            </div>
          </div>
        </section>

        {/* What it does */}
        <section id="what" className="scroll-mt-20 border-t border-line/60 py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-5">
            <SectionHead title={d.what.title} text={d.what.text} />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {d.what.items.map((item, i) => (
                <div key={i} data-reveal style={after((i % 3) * 80)} className={card}>
                  <div className="mb-3 grid size-9 place-items-center rounded-full bg-accent-soft text-accent">
                    <CheckIcon />
                  </div>
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-fg/60">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it reaches old posts */}
        <section id="reach" className="scroll-mt-20 border-t border-line/60 bg-mist py-20 md:py-28">
          <div className="mx-auto max-w-5xl px-5">
            <SectionHead title={d.reach.title} text={d.reach.text} />
            <div data-reveal className="mx-auto max-w-2xl rounded-2xl border border-line bg-surface p-7">
              <h3 className="text-2xl font-bold tracking-[-0.02em]">{d.reach.archiveTitle}</h3>
              <p className="mt-3 leading-relaxed text-fg/70">{d.reach.archiveText}</p>
              <p className="mt-5 flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-fg/80">
                <WarnIcon />
                <span>{d.reach.warn}</span>
              </p>
            </div>
          </div>
        </section>

        {/* Privacy */}
        <section id="privacy" className="scroll-mt-20 border-t border-line/60 py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-5">
            <SectionHead title={d.privacy.title} text={d.privacy.text} />
            <div className="grid gap-4 sm:grid-cols-2">
              {d.privacy.items.map((item, i) => (
                <div key={i} data-reveal style={after((i % 2) * 80)} className={`${card} flex gap-4`}>
                  <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
                    <LockIcon />
                  </div>
                  <div>
                    <h3 className="font-semibold">{item.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-fg/60">{item.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Install */}
        <section id="install" className="scroll-mt-20 border-t border-line/60 bg-mist py-20 md:py-28">
          <div className="mx-auto max-w-5xl px-5">
            <SectionHead title={d.install.title} text={d.install.text} />
            <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {d.install.steps.map((step, i) => (
                <li key={i} data-reveal style={after(i * 80)} className={card}>
                  <span className="font-mono text-sm font-semibold text-accent">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="mt-2 font-semibold">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-fg/60">{step.text}</p>
                </li>
              ))}
            </ol>
            <div data-reveal className="mt-10 text-center">
              <a href={DOWNLOAD_URL} className={`${pill} bg-accent text-white`}>
                <DownloadIcon />
                {d.download}
              </a>
            </div>
          </div>
        </section>

        {/* Limitations */}
        <section className="border-t border-line/60 py-20 md:py-28">
          <div className="mx-auto max-w-5xl px-5">
            <SectionHead title={d.limits.title} />
            <div className="grid gap-4 md:grid-cols-3">
              {d.limits.items.map((item, i) => (
                <div key={i} data-reveal style={after(i * 80)} className={card}>
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-fg/60">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* GitHub repository */}
        <section id="github" className="scroll-mt-20 border-t border-line/60 bg-mist py-20 md:py-28">
          <div className="mx-auto max-w-5xl px-5">
            <SectionHead title={d.repo.title} text={d.repo.text} />

            {/* A card in the shape of the repository's own header on GitHub. */}
            <a
              data-reveal
              href={REPO_URL}
              target="_blank"
              rel="noopener"
              className="group mx-auto block max-w-3xl rounded-2xl border border-line bg-surface p-6 transition-colors hover:border-fg/30 md:p-7"
            >
              <div className="flex items-center gap-3">
                <GithubLogo className="size-6 shrink-0 text-fg" />
                <p className="font-mono text-[15px]">
                  <span className="text-fg/60">guilhermekollet / </span>
                  <span className="font-semibold text-accent group-hover:underline">x-cleaner</span>
                </p>
                <span className="ml-auto rounded-full border border-line px-2.5 py-0.5 text-xs text-fg/60">Public</span>
              </div>
              <p className="mt-4 leading-relaxed text-fg/70">{d.repo.description}</p>
              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-fg/60">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-3 rounded-full bg-[#f1e05a]" aria-hidden="true" />
                  JavaScript
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ScaleIcon />
                  {d.repo.license}
                </span>
                {/* Counts show up once there is something to count. */}
                {stats && stats.stars > 0 ? (
                  <span className="inline-flex items-center gap-1.5">
                    <StarIcon />
                    <b className="font-semibold text-fg">{stats.stars}</b> {d.repo.stars}
                  </span>
                ) : null}
                {stats && stats.forks > 0 ? (
                  <span className="inline-flex items-center gap-1.5">
                    <ForkIcon />
                    <b className="font-semibold text-fg">{stats.forks}</b> {d.repo.forks}
                  </span>
                ) : null}
              </div>
              <div className="mt-6 border-t border-line pt-5">
                <p className="text-xs font-medium tracking-wide text-fg/50 uppercase">{d.repo.clone}</p>
                <pre className="mt-2 overflow-x-auto rounded-lg bg-mist px-4 py-3 font-mono text-[13px] text-fg/80">
                  <code>git clone {REPO_URL}.git</code>
                </pre>
              </div>
            </a>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {d.repo.items.map((item, i) => (
                <a
                  key={i}
                  data-reveal
                  style={after(i * 80)}
                  href={`${REPO_URL}${item.href}`}
                  target="_blank"
                  rel="noopener"
                  className={`${card} group flex flex-col transition-colors hover:border-fg/30`}
                >
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="mt-1.5 flex-1 text-sm leading-relaxed text-fg/60">{item.text}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-accent">
                    {item.cta}
                    <span className="transition-transform group-hover:translate-x-0.5" aria-hidden="true">→</span>
                  </span>
                </a>
              ))}
            </div>

            <div data-reveal className="mt-10 text-center">
              <a href={REPO_URL} target="_blank" rel="noopener" className={`${pill} bg-pill text-pill-fg`}>
                <GithubLogo className="size-4" />
                {d.repo.view}
              </a>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 border-t border-line/60 py-20 md:py-28">
          <div className="mx-auto max-w-3xl px-5">
            <SectionHead title={d.faq.title} />
            <div className="space-y-3">
              {d.faq.items.map((item, i) => (
                <details key={i} data-reveal className={`${card} group`}>
                  <summary className="flex cursor-pointer items-center justify-between gap-4 font-medium">
                    {item.q}
                    <PlusIcon />
                  </summary>
                  <div className="mt-3 text-sm leading-relaxed text-fg/60">{item.a}</div>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-line/60 py-12" aria-label={d.a11y.footer}>
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-5 text-center">
          <a href="#top" className="flex items-center gap-2 font-semibold">
            <Mark className="size-6 text-fg" />
            X Cleaner
          </a>
          <p className="text-sm text-fg/60">{d.footer.tagline}</p>
          <div className="flex items-center gap-4 text-sm">
            <a href={REPO_URL} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 text-fg/70 hover:text-fg">
              <GithubLogo className="size-4" />
              {d.footer.openSource}
            </a>
          </div>
          <div className="mt-2">
            <HeaderMenu lang={lang} dict={d} />
          </div>
          <p className="mt-2 text-xs text-fg/40">{d.footer.notAffiliated}</p>
        </div>
      </footer>
    </>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </svg>
  );
}
function WarnIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-danger" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </svg>
  );
}
function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
    </svg>
  );
}
function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z" />
    </svg>
  );
}
function ForkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="6" cy="5" r="2" />
      <circle cx="18" cy="5" r="2" />
      <circle cx="12" cy="19" r="2" />
      <path d="M6 7v2a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7M12 12v5" />
    </svg>
  );
}
function ScaleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v18M5 21h14M7 7h10M7 7l-3 7a3 3 0 0 0 6 0zM17 7l-3 7a3 3 0 0 0 6 0z" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-fg/40 transition-transform group-open:rotate-45" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
