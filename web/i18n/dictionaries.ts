// Every piece of copy on the site, in each language it is published in. The page picks the
// dictionary from the URL (/en, /pt); the root URL sends visitors to the one that matches their
// browser, falling back to English. Keep claims in step with the README — nothing here should
// promise more than the extension does.

export const locales = ["en", "pt"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export const hasLocale = (value: string): value is Locale => (locales as readonly string[]).includes(value);

export const localeInfo: Record<Locale, { htmlLang: string; short: string; name: string }> = {
  en: { htmlLang: "en", short: "EN", name: "English" },
  pt: { htmlLang: "pt-BR", short: "PT", name: "Português" },
};

const en = {
  meta: {
    title: "X Cleaner — Delete your posts on X, in your browser",
    description:
      "A browser extension that deletes your own posts, replies and reposts on X, in batches, at a speed you control. No server, no account access, no fee.",
  },
  a11y: { sections: "Sections", footer: "Footer", menu: "Language and appearance" },
  download: "Download extension",
  menu: { language: "Language", appearance: "Appearance", light: "Light", dark: "Dark" },
  hero: {
    eyebrow: "Open-source browser extension",
    title: "Clear your history on X.",
    text: "Delete your own posts, replies and reposts — in batches, at a speed you control. Everything runs in your browser. No server, no account access, no fee.",
    see: "How it works",
  },
  demo: {
    title: "X Cleaner",
    deleted: "deleted",
    gone: "already gone",
    failures: "failures",
    status: "Working… reading your timeline.",
    caption: "A test run, deleting one post at a time with a pause between each.",
  },
  what: {
    title: "What it does",
    text: "A focused tool for one job: removing what you posted, with guardrails so nothing goes wrong.",
    items: [
      { title: "Posts, replies and reposts", text: "Deletes your posts and replies, and undoes your reposts. Likes too, when you use the archive." },
      { title: "Two ways to find them", text: "Your profile timeline for recent posts with no file at all, or the archive X gives you to reach everything, including old posts." },
      { title: "Filters", text: "By type, by keyword, by date range, and a keep-list of IDs — so your pinned post, for one, stays put." },
      { title: "A speed you control", text: "Cautious, Normal or Fast. It reads X's own rate-limit signal and waits automatically when told to." },
      { title: "A test run first", text: "Stop after 5 to confirm it removes the right things, then turn the test off and run the rest." },
      { title: "Pause, resume, continue", text: "Stop anytime. Progress is saved, so an interrupted run picks up where it left off instead of starting over." },
    ],
  },
  reach: {
    title: "How it reaches old posts",
    text: "X only lists about the most recent 3,200 posts on a profile. The extension's timeline mode can't see past that on a large account.",
    archiveTitle: "The archive reaches everything",
    archiveText:
      "Download an archive of your data from X (Settings → Your account → Download an archive of your data). It holds the ID of every post you ever made, so the extension can delete each one directly, no matter how old. The file is read in your browser — never uploaded — and it doubles as your backup.",
    warn: "Deletion is permanent. X has no trash and no undo. Download your archive first, and do a test run before deleting everything.",
  },
  privacy: {
    title: "Private by design",
    text: "X Cleaner has no server and makes no third-party requests.",
    items: [
      { title: "Nothing is uploaded", text: "Your posts and your archive are read in your browser. The archive file never leaves your machine." },
      { title: "Only x.com", text: "The only requests are to x.com, with your browser's own session — the same calls the website makes when you click Delete." },
      { title: "No account access", text: "No OAuth, no login to a third party, no API key. Nobody but you touches your account." },
      { title: "You can read every line", text: "It's open source under the MIT license. Audit it, change it, or build it yourself." },
    ],
  },
  install: {
    title: "Install it",
    text: "Not on the Chrome Web Store yet — install it unpacked. Works in Chrome, Edge, Brave and Arc.",
    steps: [
      { title: "Download", text: "Grab the latest release and unzip it, or clone the repository." },
      { title: "Open the extensions page", text: "Go to chrome://extensions and turn on Developer mode, top right." },
      { title: "Load unpacked", text: "Click Load unpacked and pick the folder with manifest.json." },
      { title: "Run it", text: "Open x.com signed in, click the X Cleaner icon, and start with a test run." },
    ],
  },
  limits: {
    title: "Honest limitations",
    items: [
      { title: "It can break when X changes", text: "It follows the live site's internal API, which absorbs most changes, but a larger one can still stop it. If that happens, open an issue." },
      { title: "Pace matters", text: "Deleting too fast can make X slow you down or ask for a verification. The presets are deliberately conservative." },
      { title: "A grey area in X's terms", text: "This automates x.com's private web API. Use it on your own account, at a reasonable pace, at your own risk." },
    ],
  },
  repo: {
    title: "Open source on GitHub",
    text: "Every line of X Cleaner is public. Read how it works, report a problem, or help make it better.",
    description: "Delete your own posts, replies and reposts on X — in batches, at a speed you control. Runs entirely in your browser.",
    stars: "stars",
    forks: "forks",
    license: "MIT license",
    view: "View repository",
    clone: "Or build it yourself",
    items: [
      { title: "Read the code", text: "Plain JavaScript, no dependencies and no build step. See exactly which requests it makes.", cta: "Browse the source", href: "/tree/main/src" },
      { title: "Report a problem", text: "X changes its site from time to time. If a run halts, an issue with the popup's message helps fix it fast.", cta: "Open an issue", href: "/issues/new/choose" },
      { title: "Contribute", text: "Pull requests are welcome — a Firefox port, translations, or a sharper test suite.", cta: "Read the guide", href: "/blob/main/CONTRIBUTING.md" },
    ],
  },
  faq: {
    title: "Questions",
    items: [
      { q: "Is it safe to sign in?", a: "You never sign in to anything new. The extension uses the x.com session already open in your browser, and talks only to x.com." },
      { q: "Can I get my posts back after deleting?", a: "No. Deletion on X is permanent — there is no trash. That's why the extension asks for the archive and offers a test run first." },
      { q: "Will my account get limited?", a: "If you delete too fast, X may slow you down temporarily or ask for a verification. The extension reads X's rate-limit signal and waits; prefer the Cautious preset on large accounts." },
      { q: "How long does a full run take?", a: "A few hours for many thousands of posts, because of the safety pauses. Keep the x.com tab open; you can close the popup and reopen it to see progress." },
      { q: "Does it work on Firefox?", a: "Not yet — it's a Chrome-family (Manifest V3) extension. A Firefox port is welcome." },
    ],
  },
  footer: {
    tagline: "Delete your posts on X, in your browser.",
    openSource: "Open source (MIT)",
    notAffiliated: "Not affiliated with, or endorsed by, X Corp.",
  },
};

const pt: typeof en = {
  meta: {
    title: "X Cleaner — Apague seus posts no X, pelo navegador",
    description:
      "Uma extensão de navegador que apaga seus posts, respostas e reposts no X, em lotes, no ritmo que você controla. Sem servidor, sem acesso à conta, sem custo.",
  },
  a11y: { sections: "Seções", footer: "Rodapé", menu: "Idioma e aparência" },
  download: "Baixar extensão",
  menu: { language: "Idioma", appearance: "Aparência", light: "Claro", dark: "Escuro" },
  hero: {
    eyebrow: "Extensão de navegador open source",
    title: "Limpe seu histórico no X.",
    text: "Apague seus posts, respostas e reposts — em lotes, no ritmo que você controla. Tudo roda no seu navegador. Sem servidor, sem acesso à conta, sem custo.",
    see: "Como funciona",
  },
  demo: {
    title: "X Cleaner",
    deleted: "apagados",
    gone: "já não existiam",
    failures: "falhas",
    status: "Trabalhando… lendo sua timeline.",
    caption: "Uma rodada de teste, apagando um post por vez com uma pausa entre cada um.",
  },
  what: {
    title: "O que faz",
    text: "Uma ferramenta focada em uma tarefa: remover o que você postou, com travas para nada dar errado.",
    items: [
      { title: "Posts, respostas e reposts", text: "Apaga seus posts e respostas e desfaz seus reposts. E curtidas também, quando você usa o arquivo." },
      { title: "Dois jeitos de localizar", text: "A timeline do seu perfil para os posts recentes, sem arquivo nenhum, ou o arquivo que o X fornece para alcançar tudo, inclusive os antigos." },
      { title: "Filtros", text: "Por tipo, por palavra-chave, por período, e uma lista de IDs a manter — para o post fixado, por exemplo, ficar onde está." },
      { title: "Um ritmo que você controla", text: "Cauteloso, Normal ou Rápido. Ele lê o próprio limite do X e espera sozinho quando é avisado." },
      { title: "Primeiro um teste", text: "Para depois de 5 para você conferir se remove o certo; aí é só desligar o teste e rodar o resto." },
      { title: "Pausar, retomar, continuar", text: "Pare quando quiser. O progresso fica salvo, então uma rodada interrompida continua de onde parou." },
    ],
  },
  reach: {
    title: "Como alcança posts antigos",
    text: "O X só lista mais ou menos os 3.200 posts mais recentes de um perfil. O modo timeline não enxerga além disso numa conta grande.",
    archiveTitle: "O arquivo alcança tudo",
    archiveText:
      "Baixe um arquivo dos seus dados no X (Configurações → Sua conta → Baixar um arquivo dos seus dados). Ele traz o ID de todos os posts que você já fez, então a extensão apaga cada um direto, por mais antigo que seja. O arquivo é lido no seu navegador — nunca enviado — e ainda serve de backup.",
    warn: "A exclusão é permanente. O X não tem lixeira nem desfazer. Baixe o arquivo antes e faça um teste antes de apagar tudo.",
  },
  privacy: {
    title: "Privado por princípio",
    text: "O X Cleaner não tem servidor e não faz nenhuma requisição a terceiros.",
    items: [
      { title: "Nada é enviado", text: "Seus posts e seu arquivo são lidos no seu navegador. O arquivo nunca sai da sua máquina." },
      { title: "Só o x.com", text: "As únicas requisições são para o x.com, com a sua própria sessão — as mesmas chamadas que o site faz quando você clica em Excluir." },
      { title: "Sem acesso à conta", text: "Sem OAuth, sem login em terceiros, sem chave de API. Ninguém além de você toca na sua conta." },
      { title: "Você pode ler cada linha", text: "É open source sob a licença MIT. Audite, modifique ou compile você mesmo." },
    ],
  },
  install: {
    title: "Instale",
    text: "Ainda não está na Chrome Web Store — instale sem compactação. Funciona no Chrome, Edge, Brave e Arc.",
    steps: [
      { title: "Baixe", text: "Pegue o último release e descompacte, ou clone o repositório." },
      { title: "Abra as extensões", text: "Vá em chrome://extensions e ligue o Modo do desenvolvedor, no canto superior direito." },
      { title: "Carregar sem compactação", text: "Clique em Carregar sem compactação e escolha a pasta com o manifest.json." },
      { title: "Use", text: "Abra o x.com logado, clique no ícone do X Cleaner e comece por um teste." },
    ],
  },
  limits: {
    title: "Limitações honestas",
    items: [
      { title: "Pode quebrar quando o X muda", text: "Ele segue a API interna do site ao vivo, o que absorve a maioria das mudanças, mas uma maior ainda pode parar tudo. Se acontecer, abra uma issue." },
      { title: "O ritmo importa", text: "Apagar rápido demais pode fazer o X te frear ou pedir verificação. Os presets são propositalmente conservadores." },
      { title: "Zona cinzenta dos termos do X", text: "Isso automatiza a API web privada do x.com. Use na sua conta, num ritmo razoável, por sua conta e risco." },
    ],
  },
  repo: {
    title: "Open source no GitHub",
    text: "Cada linha do X Cleaner é pública. Veja como funciona, relate um problema ou ajude a melhorar.",
    description: "Apague seus posts, respostas e reposts no X — em lotes, no ritmo que você controla. Roda inteiro no seu navegador.",
    stars: "estrelas",
    forks: "forks",
    license: "Licença MIT",
    view: "Ver repositório",
    clone: "Ou compile você mesmo",
    items: [
      { title: "Leia o código", text: "JavaScript puro, sem dependências e sem etapa de build. Veja exatamente quais requisições ele faz.", cta: "Ver o código-fonte", href: "/tree/main/src" },
      { title: "Relate um problema", text: "O X muda o site de tempos em tempos. Se uma rodada parar, uma issue com a mensagem do popup ajuda a corrigir rápido.", cta: "Abrir uma issue", href: "/issues/new/choose" },
      { title: "Contribua", text: "Pull requests são bem-vindos — um port para o Firefox, traduções ou testes mais completos.", cta: "Ler o guia", href: "/blob/main/CONTRIBUTING.md" },
    ],
  },
  faq: {
    title: "Dúvidas",
    items: [
      { q: "É seguro fazer login?", a: "Você não faz login em nada novo. A extensão usa a sessão do x.com já aberta no seu navegador e conversa só com o x.com." },
      { q: "Dá para recuperar os posts depois?", a: "Não. A exclusão no X é permanente — não há lixeira. Por isso a extensão pede o arquivo e oferece um teste antes." },
      { q: "Minha conta pode ser limitada?", a: "Se você apagar rápido demais, o X pode te frear por um tempo ou pedir verificação. A extensão lê o limite do X e espera; prefira o preset Cauteloso em contas grandes." },
      { q: "Quanto tempo leva uma rodada completa?", a: "Algumas horas para muitos milhares de posts, por causa das pausas de segurança. Deixe a aba do x.com aberta; dá para fechar o popup e reabrir para ver o progresso." },
      { q: "Funciona no Firefox?", a: "Ainda não — é uma extensão da família Chrome (Manifest V3). Um port para o Firefox é bem-vindo." },
    ],
  },
  footer: {
    tagline: "Apague seus posts no X, pelo navegador.",
    openSource: "Open source (MIT)",
    notAffiliated: "Sem afiliação ou endosso da X Corp.",
  },
};

export type Dictionary = typeof en;

const dictionaries: Record<Locale, Dictionary> = { en, pt };

export const getDictionary = (locale: Locale): Dictionary => dictionaries[locale];
