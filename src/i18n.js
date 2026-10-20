// The popup's copy in English and Brazilian Portuguese, and the switch between them. The choice
// is saved in the extension's storage; until there is one, it follows the browser's language.
// Static text is marked in popup.html with data-i18n (text) and data-i18n-placeholder; the
// popup asks for everything else through t().
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
      "speed.title": "Pace",
      "speed.cautious": "Cautious",
      "speed.normal": "Normal",
      "speed.fast": "Fast",
      "test.title": "Test run",
      "test.hint": "first 5 only",
      "filters.title": "More options",
      "filters.keyword": "Only items containing",
      "filters.keywordPh": "a word or phrase",
      "filters.since": "From",
      "filters.until": "Until",
      "filters.keep": "Keep these IDs",
      "filters.keepPh": "e.g. your pinned post",
      "confirm.ack": "I understand deletion is permanent — there's no undo.",
      "confirm.type": "Type {word} to delete everything",
      "confirm.word": "DELETE",
      "start.test": "Run a test with 5",
      "start.all": "Delete everything",
      resume: "Continue the previous run",
      resumeHint: "skips what was already deleted",
      "run.deleted": "deleted",
      "run.gone": "already gone",
      "run.failures": "failures",
      "run.pause": "Pause",
      "run.resume": "Resume",
      "run.stop": "Stop",
      "run.again": "New run",
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
      "foot.private": "Runs only in your browser",
      "foot.source": "Open source",
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
      "speed.title": "Ritmo",
      "speed.cautious": "Cauteloso",
      "speed.normal": "Normal",
      "speed.fast": "Rápido",
      "test.title": "Teste",
      "test.hint": "só os 5 primeiros",
      "filters.title": "Mais opções",
      "filters.keyword": "Só itens que contêm",
      "filters.keywordPh": "uma palavra ou frase",
      "filters.since": "De",
      "filters.until": "Até",
      "filters.keep": "Manter estes IDs",
      "filters.keepPh": "ex.: seu post fixado",
      "confirm.ack": "Entendo que apagar é permanente — não tem como desfazer.",
      "confirm.type": "Digite {word} para apagar tudo",
      "confirm.word": "APAGAR",
      "start.test": "Fazer teste com 5",
      "start.all": "Apagar tudo",
      resume: "Continuar a rodada anterior",
      resumeHint: "pula o que já foi apagado",
      "run.deleted": "apagados",
      "run.gone": "já não existiam",
      "run.failures": "falhas",
      "run.pause": "Pausar",
      "run.resume": "Retomar",
      "run.stop": "Parar",
      "run.again": "Nova rodada",
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
      "foot.private": "Roda só no seu navegador",
      "foot.source": "Código aberto",
    },
  };

  let lang = (navigator.language || "").toLowerCase().startsWith("pt") ? "pt" : "en";
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
    get lang() {
      return lang;
    },
    onChange(fn) {
      listeners.push(fn);
    },
    // Every word that unlocks a full run, in any language: typing either one works.
    confirmWords: () => [dict.en["confirm.word"], dict.pt["confirm.word"]],
  };
})();
