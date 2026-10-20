import { defaultLocale, locales } from "./dictionaries";

// A JavaScript expression, for inline scripts, that evaluates to the visitor's language: the one
// chosen in the header switcher, if any, then the first of the browser's languages the site has,
// then English. The site is static, so this can only be decided in the browser.
export const detectLocaleExpression = `(function(){var s=${JSON.stringify(locales)},l;try{l=localStorage.getItem("lang")}catch(e){}if(s.indexOf(l)>=0)return l;var n=navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||""];for(var i=0;i<n.length;i++){var p=String(n[i]).slice(0,2).toLowerCase();if(s.indexOf(p)>=0)return p}return ${JSON.stringify(defaultLocale)}})()`;
