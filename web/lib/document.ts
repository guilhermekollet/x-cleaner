import { Instrument_Sans, Instrument_Serif, JetBrains_Mono } from "next/font/google";

// Shared by every full HTML document the site renders: the language pages and the 404 page.

const instrumentSans = Instrument_Sans({ variable: "--font-instrument-sans", subsets: ["latin"] });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"] });
const instrumentSerif = Instrument_Serif({ variable: "--font-instrument-serif", subsets: ["latin"], weight: "400" });

export const htmlClassName = `${instrumentSans.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable} antialiased`;

// Sets the theme before the first paint: the saved choice or, if there is none, the system's.
export const themeScript = `(function(){try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="dark"}})()`;

// Same value next.config.ts uses for basePath. Plain links and inline scripts need it spelled out;
// next/link adds it on its own.
export const basePath = process.env.PAGES_BASE_PATH ?? "";
