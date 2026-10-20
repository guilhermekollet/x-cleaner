import { Geist, Geist_Mono } from "next/font/google";

// Shared by every full HTML document the site renders: the language pages and the 404 page.

// Geist: a clean, sturdy sans close to x.com's own type, bold for headings. Geist Mono for code.
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const htmlClassName = `${geistSans.variable} ${geistMono.variable} antialiased`;

// Sets the theme before the first paint: the saved choice or, if there is none, the system's.
export const themeScript = `(function(){try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="dark"}})()`;

// Same value next.config.ts uses for basePath. Plain links and inline scripts need it spelled out;
// next/link adds it on its own.
export const basePath = process.env.PAGES_BASE_PATH ?? "";
