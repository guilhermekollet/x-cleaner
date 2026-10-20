// The X Cleaner mark: a broom sweeping a few specks, drawn in the current text color so it reads
// as white-on-black (or black-on-white) like x.com. Used in the header and the hero.
export function Mark({ className, animated }: { className?: string; animated?: boolean }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" fill="none">
      <g className={animated ? "sweep" : undefined}>
        {/* Handle */}
        <path d="M34 11 L22 27" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
        {/* Broom head */}
        <path d="M14 29 h12 l4 9 h-20 z" fill="currentColor" opacity="0.5" />
        <path d="M14 29 h12 v3 h-12 z" fill="currentColor" />
        <path d="M11 38 v-2 M16 38 v-3 M21 38 v-2 M26 38 v-3 M31 38 v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </g>
      {/* Specks being swept */}
      <circle className={animated ? "speck" : undefined} cx="33" cy="31" r="1.4" fill="currentColor" style={{ animationDelay: "0ms" }} />
      <circle className={animated ? "speck" : undefined} cx="37" cy="34" r="1.1" fill="currentColor" style={{ animationDelay: "500ms" }} />
      <circle className={animated ? "speck" : undefined} cx="35" cy="38" r="1" fill="currentColor" style={{ animationDelay: "900ms" }} />
    </svg>
  );
}

// GitHub logo, drawn in the current text color.
export function GithubLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}
