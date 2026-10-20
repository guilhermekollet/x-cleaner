// The pages' copy in English and Brazilian Portuguese, and the switch between them. They open in
// the browser's language; a flag the user picks is saved in the extension's storage and wins.
// Static text is marked in the pages with data-i18n (text), data-i18n-placeholder and
// data-i18n-title (tooltip and accessible name); the scripts ask for everything else through t().
globalThis.XI18n = (() => {
  const STORAGE_KEY = "xcleaner.lang";

  const dict = {
    en: {
      tagline: "Delete your posts on X",
      "status.checking": "Checking this tab…",
      "status.notX": "Open x.com in this tab and sign in.",
      "status.reload": "Reload the x.com tab once, then open X Cleaner again.",
      "status.signedOut": "You're on x.com but not signed in.",
      "status.ready": "Signed in · runs on the account in this tab",
      "source.title": "Where to find your posts",
      "source.timeline": "Recent",
      "source.timelineHint": "Reads your profile. No file needed.",
      "source.timelineHintOldest": "Only the ~3,200 your profile lists.",
      "source.archive": "Archive file",
      "source.archiveHint": "Reaches everything, even old posts.",
      "archive.pick": "Choose the archive file",
      "archive.pickInTab": "Choose the file in a tab",
      "archive.help": "Settings → Your account → Download an archive of your data. Pick the .zip or data/tweets.js.",
      "archive.reading": "Reading…",
      "archive.items": "{n} items",
      "archive.error": "Couldn't read that file. Pick the .zip or data/tweets.js.",
      "types.title": "What to delete",
      "types.post": "Posts",
      "types.reply": "Replies",
      "types.repost": "Reposts",
      "types.like": "Likes",
      "types.likeHint": "Likes are only reachable through the archive file.",
      "speed.title": "How to delete",
      "batch.label": "How many per run",
      "batch.size": "Batches of {n}",
      "batch.all": "Everything at once",
      "order.label": "Order",
      "order.newest": "Newest first",
      "order.oldest": "Oldest first",
      "speed.cautious": "Cautious",
      "speed.normal": "Normal",
      "speed.fast": "Fast",
      "test.first": "Test with 5 first",
      "testDone.title": "Test done",
      "testDone.text": "Test done: {n} deleted. Check your profile before deleting the rest.",
      "testDone.view": "View profile",
      "testDone.continue": "Continue and delete the rest",
      "full.banner": "Test passed. The full run continues from where the test stopped.",
      "filters.title": "More options",
      "filters.keyword": "Only items containing",
      "filters.keywordPh": "a word or phrase",
      "filters.since": "From",
      "filters.until": "Until",
      "filters.keep": "Keep these IDs",
      "filters.keepPh": "e.g. your pinned post",
      "confirm.ack": "I understand deletion is permanent — there's no undo.",
      "start.test": "Run a test with 5",
      "start.all": "Delete everything",
      "start.allOldest": "Delete everything, oldest first",
      "start.batchNewest": "Delete the {n} newest",
      "start.batchOldest": "Delete the {n} oldest",
      resume: "Continue the previous run",
      resumeHint: "skips what was already deleted",
      "run.deleted": "deleted",
      "run.gone": "already gone",
      "run.failures": "failures",
      "run.pause": "Pause",
      "run.resume": "Resume",
      "run.stop": "Stop",
      "run.again": "New run",
      "run.next": "Next batch",
      "run.batchDone": "Batch done: {n} deleted.",
      "run.left": "{n} left.",
      "run.scanning": "Reading your profile… {n} found.",
      "run.working": "Working…",
      "run.progress": "{done} of {total}",
      "run.limited": "X slowed things down — continuing in {s}s.",
      "run.batch": "Short break — back in {s}s.",
      "run.paused": "Paused.",
      "run.done": "Done.",
      "run.stopped": "Stopped. You can continue later.",
      "run.stoppedWith": "Stopped: {reason}",
      "run.fatalApi": "X changed its internal API. The extension needs an update — please open an issue.",
      "run.fatalSession": "X rejected the session. Reload x.com, check you're signed in and try again.",
      "run.alreadyRunning": "A run is already in progress.",
      "run.couldNotStart": "Couldn't start — reload the x.com tab and try again.",
      "run.historyErrors": "{n} deleted items couldn't be added to the history.",
      "foot.private": "Runs only in your browser",
      "foot.source": "Open source",
      "history.open": "History",
      "history.openLabel": "History of what was deleted",
      "history.title": "Deletion history",
      "history.tagline": "What X Cleaner deleted, kept as a backup",
      "history.private": "Kept only in this browser. Nothing is uploaded; the backups are made on your computer.",
      "history.total": "{n} deleted",
      "history.totalOne": "1 deleted",
      "history.account": "Account",
      "history.search": "Search the text, a link or an ID",
      "history.all": "All",
      "history.json": "Download JSON",
      "history.csv": "Download CSV",
      "history.clear": "Clear history",
      "history.deleted": "Deleted {date}",
      "history.youReposted": "You reposted",
      "history.youLiked": "You liked",
      "history.replyingTo": "Replying to {user}",
      "history.unknownAuthor": "Unknown author",
      "history.openOnX": "Open on X",
      "history.media.photo": "Photo",
      "history.media.video": "Video",
      "history.media.gif": "GIF",
      "history.more": "Show {n} more",
      "history.showing": "{shown} of {total}",
      "history.none": "No matches.",
      "history.emptyTitle": "Nothing deleted yet",
      "history.empty": "What X Cleaner deletes shows up here, with its full text, so you keep a copy.",
      "history.loading": "Loading…",
      "history.loadError": "Couldn't read the history from the browser's storage.",
      "history.confirmTitle": "Clear the history?",
      "history.confirmText": "This removes the {n} records of this account from this browser. The posts are already gone from X, so this copy is the only one left: download a backup first.",
      "history.cancel": "Cancel",
      "history.confirmClear": "Clear",
    },
    pt: {
      tagline: "Apague seus posts no X",
      "status.checking": "Verificando esta aba…",
      "status.notX": "Abra o x.com nesta aba e entre na sua conta.",
      "status.reload": "Recarregue a aba do x.com uma vez e abra o X Cleaner de novo.",
      "status.signedOut": "Você está no x.com, mas não entrou na sua conta.",
      "status.ready": "Conectado · roda na conta aberta nesta aba",
      "source.title": "Onde encontrar seus posts",
      "source.timeline": "Recentes",
      "source.timelineHint": "Lê o seu perfil. Sem arquivo.",
      "source.timelineHintOldest": "Só os ~3.200 que o perfil lista.",
      "source.archive": "Arquivo do X",
      "source.archiveHint": "Alcança tudo, até os posts antigos.",
      "archive.pick": "Escolher o arquivo",
      "archive.pickInTab": "Escolher o arquivo numa aba",
      "archive.help": "Configurações → Sua conta → Baixar um arquivo dos seus dados. Escolha o .zip ou o data/tweets.js.",
      "archive.reading": "Lendo…",
      "archive.items": "{n} itens",
      "archive.error": "Não deu para ler esse arquivo. Escolha o .zip ou o data/tweets.js.",
      "types.title": "O que apagar",
      "types.post": "Posts",
      "types.reply": "Respostas",
      "types.repost": "Reposts",
      "types.like": "Curtidas",
      "types.likeHint": "As curtidas só são alcançadas pelo arquivo do X.",
      "speed.title": "Como apagar",
      "batch.label": "Quantos por vez",
      "batch.size": "Lotes de {n}",
      "batch.all": "Tudo de uma vez",
      "order.label": "Ordem",
      "order.newest": "Mais recentes primeiro",
      "order.oldest": "Mais antigos primeiro",
      "speed.cautious": "Cauteloso",
      "speed.normal": "Normal",
      "speed.fast": "Rápido",
      "test.first": "Testar com 5 primeiro",
      "testDone.title": "Teste concluído",
      "testDone.text": "Teste concluído: {n} apagados. Confira no seu perfil antes de apagar o resto.",
      "testDone.view": "Ver perfil",
      "testDone.continue": "Continuar e apagar o resto",
      "full.banner": "Teste aprovado. A rodada completa continua de onde o teste parou.",
      "filters.title": "Mais opções",
      "filters.keyword": "Só itens que contêm",
      "filters.keywordPh": "uma palavra ou frase",
      "filters.since": "De",
      "filters.until": "Até",
      "filters.keep": "Manter estes IDs",
      "filters.keepPh": "ex.: seu post fixado",
      "confirm.ack": "Entendo que apagar é permanente — não tem como desfazer.",
      "start.test": "Fazer teste com 5",
      "start.all": "Apagar tudo",
      "start.allOldest": "Apagar tudo, dos mais antigos",
      "start.batchNewest": "Apagar os {n} mais recentes",
      "start.batchOldest": "Apagar os {n} mais antigos",
      resume: "Continuar a rodada anterior",
      resumeHint: "pula o que já foi apagado",
      "run.deleted": "apagados",
      "run.gone": "já não existiam",
      "run.failures": "falhas",
      "run.pause": "Pausar",
      "run.resume": "Retomar",
      "run.stop": "Parar",
      "run.again": "Nova rodada",
      "run.next": "Próximo lote",
      "run.batchDone": "Lote concluído: {n} apagados.",
      "run.left": "Faltam {n}.",
      "run.scanning": "Lendo seu perfil… {n} encontrados.",
      "run.working": "Trabalhando…",
      "run.progress": "{done} de {total}",
      "run.limited": "O X pediu calma — continuando em {s}s.",
      "run.batch": "Pausa curta — voltando em {s}s.",
      "run.paused": "Pausado.",
      "run.done": "Pronto.",
      "run.stopped": "Parado. Dá para continuar depois.",
      "run.stoppedWith": "Parou: {reason}",
      "run.fatalApi": "O X mudou a API interna. A extensão precisa de uma atualização — abra uma issue, por favor.",
      "run.fatalSession": "O X recusou a sessão. Recarregue o x.com, confira se está conectado e tente de novo.",
      "run.alreadyRunning": "Já tem uma rodada em andamento.",
      "run.couldNotStart": "Não deu para começar — recarregue a aba do x.com e tente de novo.",
      "run.historyErrors": "{n} itens apagados não entraram no histórico.",
      "foot.private": "Roda só no seu navegador",
      "foot.source": "Código aberto",
      "history.open": "Histórico",
      "history.openLabel": "Histórico do que foi apagado",
      "history.title": "Histórico de exclusões",
      "history.tagline": "O que o X Cleaner apagou, guardado como backup",
      "history.private": "Fica só neste navegador. Nada é enviado; os backups são gerados no seu computador.",
      "history.total": "{n} apagados",
      "history.totalOne": "1 apagado",
      "history.account": "Conta",
      "history.search": "Busque no texto, num link ou num ID",
      "history.all": "Todos",
      "history.json": "Baixar JSON",
      "history.csv": "Baixar CSV",
      "history.clear": "Limpar histórico",
      "history.deleted": "Apagado em {date}",
      "history.youReposted": "Você repostou",
      "history.youLiked": "Você curtiu",
      "history.replyingTo": "Em resposta a {user}",
      "history.unknownAuthor": "Autor desconhecido",
      "history.openOnX": "Abrir no X",
      "history.media.photo": "Foto",
      "history.media.video": "Vídeo",
      "history.media.gif": "GIF",
      "history.more": "Mostrar mais {n}",
      "history.showing": "{shown} de {total}",
      "history.none": "Nada encontrado.",
      "history.emptyTitle": "Nada apagado ainda",
      "history.empty": "O que o X Cleaner apagar aparece aqui, com o texto completo, para você guardar uma cópia.",
      "history.loading": "Carregando…",
      "history.loadError": "Não deu para ler o histórico do armazenamento do navegador.",
      "history.confirmTitle": "Limpar o histórico?",
      "history.confirmText": "Isso remove os {n} registros desta conta deste navegador. Os posts já não existem no X, então esta é a única cópia: baixe um backup antes.",
      "history.cancel": "Cancelar",
      "history.confirmClear": "Limpar",
    },
  };

  // The browser's language: the first of the user's preferred languages that we have, then the
  // browser's own UI language. Portuguese from Portugal reads fine in pt-BR.
  function browserLang() {
    const prefs = [...(navigator.languages || []), navigator.language, globalThis.chrome?.i18n?.getUILanguage?.()];
    for (const l of prefs) {
      const code = String(l || "").toLowerCase().slice(0, 2);
      if (code === "pt" || code === "en") return code;
    }
    return "en";
  }

  let lang = browserLang();
  const listeners = [];

  function t(key, vars) {
    let s = dict[lang][key] ?? dict.en[key] ?? key;
    if (vars) for (const k in vars) s = s.replaceAll(`{${k}}`, String(vars[k]));
    return s;
  }

  function apply(root = document) {
    document.documentElement.lang = lang === "pt" ? "pt-BR" : "en";
    for (const el of root.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
    for (const el of root.querySelectorAll("[data-i18n-placeholder]")) el.placeholder = t(el.dataset.i18nPlaceholder);
    for (const el of root.querySelectorAll("[data-i18n-title]")) {
      el.title = t(el.dataset.i18nTitle);
      el.setAttribute("aria-label", el.title);
    }
  }

  async function load() {
    try {
      const got = await chrome.storage.local.get(STORAGE_KEY);
      if (got[STORAGE_KEY] === "pt" || got[STORAGE_KEY] === "en") lang = got[STORAGE_KEY];
    } catch {
      /* no storage: keep the browser's language */
    }
    apply();
    listeners.forEach((fn) => fn(lang));
  }

  // Wires the EN | PT switch (.lang buttons). The switch animates: the copy cross-fades into the
  // new language where the browser supports view transitions and motion isn't reduced; otherwise
  // it just changes. Clicks compare against the language being switched to, so quick clicks
  // during a transition still land on the last one.
  function bindSwitch(root = document) {
    const group = root.querySelector(".lang");
    if (!group) return;
    const mark = () => {
      group.dataset.lang = lang;
      for (const b of group.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.lang === lang));
    };
    listeners.push(mark);
    mark();
    let targetLang = null;
    for (const b of group.querySelectorAll("button"))
      b.addEventListener("click", () => {
        const next = b.dataset.lang;
        if (next === (targetLang ?? lang)) return;
        targetLang = next;
        // Every swap applies the latest target, so callbacks that run late or out of order still
        // leave the last clicked language in place.
        let applied = false;
        const swap = () => {
          if (applied) return;
          applied = true;
          set(targetLang ?? next);
        };
        if (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
          const vt = document.startViewTransition(swap);
          // A transition cut short (another click, the popup closing) is fine; don't report it.
          for (const p of [vt.ready, vt.finished, vt.updateCallbackDone]) p?.catch(() => {});
          vt.finished.finally(() => targetLang === lang && (targetLang = null)).catch(() => {});
          // The language must change even when the page can't paint the animation (a background tab).
          setTimeout(() => {
            if (applied) return;
            vt.skipTransition();
            swap();
          }, 250);
        } else {
          swap();
          targetLang = null;
        }
      });
  }

  async function set(next) {
    if (next !== "pt" && next !== "en") return;
    lang = next;
    apply();
    listeners.forEach((fn) => fn(lang));
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: next });
    } catch {}
  }

  return {
    t,
    apply,
    load,
    set,
    bindSwitch,
    // The locale for numbers and dates in the current language.
    get locale() {
      return lang === "pt" ? "pt-BR" : "en-US";
    },
    get lang() {
      return lang;
    },
    onChange(fn) {
      listeners.push(fn);
    },
  };
})();
