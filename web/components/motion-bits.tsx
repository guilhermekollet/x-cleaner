"use client";

import { useEffect } from "react";

// Reveals elements marked `data-reveal` as they scroll into view. It adds `reveal-ready` to the
// document (so the elements start hidden only when JS is on) and toggles `is-visible` per element.
export function RevealObserver() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("reveal-ready");
    const targets = Array.from(document.querySelectorAll("[data-reveal]"));
    if (!("IntersectionObserver" in window)) {
      targets.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 }
    );
    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}
