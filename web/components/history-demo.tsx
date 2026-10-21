import { Mark } from "./mark";
import type { Dictionary } from "@/i18n/dictionaries";

// A still mock of the extension's history page, in the same browser frame as the hero's demo: the
// title, the count with the JSON and CSV downloads, the search and type filter, and a few deleted
// posts drawn the way the page draws them (like posts on x.com). The posts are the hero's
// fictional ones, as if just deleted. Nothing here is real data.

export function HistoryDemo({ dict }: { dict: Dictionary }) {
  const m = dict.history.mock;
  const { name, handle } = dict.demo;

  return (
    <div
      role="img"
      aria-label={m.label}
      className="relative w-full max-w-[460px] overflow-hidden rounded-2xl border border-line bg-bg text-[15px] leading-5 shadow-2xl shadow-black/20 select-none"
    >
      {/* Browser toolbar: window buttons and the page's address. */}
      <div className="flex h-11 items-center gap-3 border-b border-line bg-mist px-3">
        <span className="flex gap-1.5" aria-hidden="true">
          <i className="size-2.5 rounded-full bg-[#ff5f57]" />
          <i className="size-2.5 rounded-full bg-[#febc2e]" />
          <i className="size-2.5 rounded-full bg-[#28c840]" />
        </span>
        <span className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-full bg-fog px-3 text-[13px] text-muted">
          <Mark className="size-3.5 shrink-0 text-fg" />
          <span className="truncate">{m.address}</span>
        </span>
      </div>

      <div className="px-4 pt-4 pb-3">
        <p className="text-[21px] leading-7 font-extrabold tracking-[-0.02em]">{m.page}</p>
        <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-muted">
          <Icon d="M6.5 10.5V8a5.5 5.5 0 0 1 11 0v2.5M5 10.5h14v10H5z" className="size-3.5 shrink-0" />
          {m.privacy}
        </p>

        {/* The count and the backups. */}
        <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
          <div className="min-w-0">
            <p className="text-[19px] leading-6 font-extrabold tracking-[-0.02em] whitespace-nowrap tabular-nums">{m.count}</p>
            <p className="truncate text-[12.5px] text-muted">{handle}</p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-pill px-3 text-[13px] font-bold text-pill-fg">
              <Icon d={DOWNLOAD} className="size-3.5" />
              {m.json}
            </span>
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-[13px] font-bold">
              <Icon d={DOWNLOAD} className="size-3.5" />
              {m.csv}
            </span>
          </div>
        </div>

        {/* Search and the type filter. */}
        <div className="mt-3 flex h-9 items-center gap-2 rounded-full border border-line px-3.5 text-[13px] text-muted">
          <Icon d="M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM20 20l-4.6-4.6" className="size-4 shrink-0" />
          <span className="truncate">{m.search}</span>
        </div>
        <div className="mt-2.5 flex gap-1.5 text-[12.5px] font-semibold">
          {m.chips.map((chip, i) => (
            <span
              key={chip}
              className={`rounded-full border px-3 py-1 ${i === 0 ? "border-fog bg-fog text-fg" : "border-line text-muted"}`}
            >
              {chip}
            </span>
          ))}
        </div>
      </div>

      {/* Deleted posts, newest deletion first, in one bordered column as on x.com. */}
      <div className="mx-4 mb-4 overflow-hidden rounded-2xl border border-line">
        {m.items.map((post, i) => (
          <article key={i} className={`flex gap-3 px-4 py-3 ${i ? "border-t border-line" : ""}`}>
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-fog font-bold text-muted" aria-hidden="true">
              {name[0]}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <span className="shrink-0 font-bold">{name}</span>
                <span className="truncate text-muted">
                  {handle} · {post.date}
                </span>
              </div>
              {post.replyTo ? (
                <p className="text-muted">
                  {m.replyingTo} <span className="text-accent">{post.replyTo}</span>
                </p>
              ) : null}
              <p className="mt-0.5 break-words">
                {post.replyTo && post.text.startsWith(post.replyTo) ? (
                  <>
                    <span className="text-accent">{post.replyTo}</span>
                    {post.text.slice(post.replyTo.length)}
                  </>
                ) : (
                  post.text
                )}
              </p>
              <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-muted">
                <Icon d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" className="size-3.5 shrink-0" />
                {post.deleted}
              </p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

const DOWNLOAD = "M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14";

function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
