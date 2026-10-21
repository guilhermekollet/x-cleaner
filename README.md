<div align="center">
  <img src="icons/icon-128.png" alt="X Cleaner" width="80" height="80">

  <h1>X Cleaner</h1>

  <p>Delete your own posts, replies and reposts on X — in batches, at a speed you control.<br>
  A browser extension that runs entirely in your browser. No account access, no server, no fee.</p>

  <p>
    <a href="https://github.com/guilhermekollet/x-cleaner/actions/workflows/ci.yml"><img src="https://github.com/guilhermekollet/x-cleaner/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-b8a4f8" alt="MIT license"></a>
    <img src="https://img.shields.io/badge/Chrome-MV3-0d0d0d" alt="Chrome Manifest V3">
  </p>
</div>

X Cleaner works through the same requests x.com's own website makes when you click **Delete** on a
post. It reads your timeline — or the archive file X gives you — finds your posts, and removes them
one by one, pausing to stay well under the limits X enforces. Everything happens on the x.com tab
you are signed in to. Nothing is uploaded, and you never hand your account to a third party.

> **Deletion is permanent.** X has no trash and no undo. Download your archive first (the extension
> can read it), and do a **test run** before deleting everything.

## Contents

- [What it does](#what-it-does)
- [Install](#install)
- [Using it](#using-it)
- [How it reaches old posts](#how-it-reaches-old-posts)
- [Privacy](#privacy)
- [Limitations](#limitations)
- [Development](#development)
- [Project layout](#project-layout)
- [Contributing](#contributing)
- [License](#license)

## What it does

- **Deletes posts, replies and reposts** (undoing reposts), and optionally **removes likes**.
- **Two ways to find your posts:**
  - *Recent, no file* — reads your profile timeline. Reaches the most recent posts the site still
    lists (X stops listing a profile at roughly 3,200 posts).
  - *Archive file* — reads the `.zip` from **Settings → Your account → Download an archive of your
    data**, unpacked in your browser. Reaches **everything**, including posts far older than the
    profile shows.
- **Filters**: by type, by keyword, by date range, and a keep-list of IDs (for your pinned post, say).
- **Speed you control**: Cautious, Normal or Fast presets, each a trade of pace against the chance X
  slows you down. It reads X's own rate-limit signal and waits automatically when told to.
- **Batches and order**: delete in batches of 100 to 2,500 (or everything at once); a batch stops
  when it fills and offers the next one, which repeats the same settings and skips what is done.
  Delete **newest first** or **oldest first**. Oldest first without the archive reads your whole
  profile before deleting, so it reaches only what the profile lists (about 3,200 posts). X serves
  about 20 posts a page and limits reads per 15 minutes, so that first read can take a while and
  may wait for X; the popup shows how far it got and how long a wait lasts. The read is kept for a
  day: a stopped read picks up where it stopped, and later batches start deleting at once. Pace,
  batch size and order are remembered.
- **An optional test run** that stops after 5, so you can confirm it deletes the right things
  first: a switch above the main button, on only until your first run.
- **Pause, resume and stop**, and a saved progress list so an interrupted run continues where it
  left off instead of starting over. If the x.com tab is reloaded or closed mid-run, or you stop a
  run, the popup offers **Continue** next time it opens, with the same settings (an archive run asks
  for the file again); after a full batch it offers **Next batch**.
- **A history of what it deleted, and a backup of it.** Every post, reply, repost or like it
  deletes is recorded with its full text, media and links, what it replied to or reposted, the post
  date and the deletion date. Open **History** at the top of the popup to browse it (newest first,
  with search and a filter by type), download it as **JSON** or **CSV**, or clear it. It is kept
  per account, only in this browser.
- **English and Portuguese (Brazil)**: it opens in your browser's language; the round flags at the
  top switch it, and the choice is remembered. Light and dark follow your system.

## Install

Not on the Chrome Web Store yet. Install it unpacked:

1. Download the latest `x-cleaner-*.zip` from
   [Releases](https://github.com/guilhermekollet/x-cleaner/releases/latest) and unzip it (or clone
   this repository).
2. Open `chrome://extensions` in Chrome, Edge, Brave or Arc.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick the unzipped folder (the one with `manifest.json`).

The X Cleaner icon appears in the toolbar.

## Using it

1. Open **x.com** in a tab and sign in.
2. Click the X Cleaner icon.
3. Choose what to read (recent timeline, or your archive file) and what to delete.
4. Leave **Test with 5 first** on and click **Run a test with 5**.
5. Check that the 5 it removed were the right ones, then click **Continue and delete the rest** (or
   turn **Test with 5 first** off), pick a batch size and an order, and click the main
   button (for example **Delete the 500 oldest**). When a batch is done, click
   **Next batch** to go on.

Keep the x.com tab open while it runs; you can close the popup, and reopen it to see progress. A full
archive of many thousands of posts takes a few hours because of the safety pauses.

## How it reaches old posts

X only lists about the most recent 3,200 posts on a profile, so the *Recent, no file* mode cannot see
further back than that on a large account. To delete older posts, use the **archive file**: it
contains the ID of every post you ever made, so the extension can delete each one directly, no matter
how old. This is why the archive is the recommended path for accounts with a long history — and it
doubles as your backup.

## Privacy

X Cleaner has no server and makes no third-party requests.

| | |
|---|---|
| Your posts and archive | Read in your browser. The archive file is parsed locally and never uploaded. |
| Requests | Only to `x.com`, with your browser's own session cookie — the same calls the website makes. |
| Account access | None is granted to anyone. There is no OAuth, no login to a third party, no API key. |
| Progress | A list of deleted IDs is kept in the browser's local extension storage, so a run can resume. Clear it anytime with **Continue a previous run** left off, or by removing the extension. |
| History | What was deleted (text, media and link addresses, dates) is kept in the same local storage, per account, so you have a copy. The JSON and CSV backups are made on your computer and saved like any download; nothing is uploaded. Clear it on the History page, or by removing the extension. |

The extension requests the `storage` and `unlimitedStorage` permissions and access to `x.com` /
`twitter.com`. `unlimitedStorage` lifts the browser's 10 MB cap on local extension storage: a history
of tens of thousands of posts with their full text outgrows it, and a backup that silently stops
recording would be worse than none. It grants no access to anything else.

## Limitations

- **It can break when X changes its site.** The extension follows the live site's internal API
  (reading its query IDs and feature flags from the page), which absorbs most changes, but a larger
  change can still stop it. If a run halts with a message about X changing its API, please
  [open an issue](https://github.com/guilhermekollet/x-cleaner/issues).
- **Pace matters.** Deleting too fast can make X slow you down temporarily or ask for a verification.
  The presets are deliberately conservative; prefer Cautious on large accounts.
- **This automates x.com's private web API**, which is a grey area in X's terms. Use it on your own
  account, at a reasonable pace, at your own risk.
- **Chrome-family browsers** (Manifest V3). A Firefox port is welcome.

## Development

No build step and no dependencies — it is plain JavaScript loaded as an unpacked extension.

```bash
git clone https://github.com/guilhermekollet/x-cleaner.git
cd x-cleaner
scripts/test.sh            # run the test suite (Node 20+)
node scripts/make-icons.mjs  # regenerate the PNG icons
scripts/package.sh         # build dist/x-cleaner-<version>.zip
```

Load the folder with **Load unpacked** (see [Install](#install)); after editing a content script,
reload the extension at `chrome://extensions` and reload the x.com tab.

The tests cover the pieces that are easy to get wrong and run without a browser: the archive
reader (including the hand-written ZIP extraction), the engine's filtering rules, and the history
(records, storage chunks, search, and the JSON and CSV backups).

## Project layout

```
manifest.json          Manifest V3: the popup, and the content scripts injected on x.com
src/
  x-api.js             Talks to x.com's GraphQL API: reads query IDs and feature flags from the
                       live page, lists timelines, deletes posts and reposts, removes likes
  archive.js           Reads the "Download an archive of your data" file (.zip or loose .js),
                       including a dependency-free ZIP reader
  run-state.js         The record of the last run, so a run cut off by a reload can be continued
  engine.js            The run: ordering, batching, pacing, rate-limit waits, pause/resume,
                       progress saved for resuming, each deletion added to the history
  history.js           The history of what was deleted: the records, their storage (per account,
                       in chunks), search, and the JSON and CSV backups
  content.js           Runs on the x.com tab; holds the engine and answers the popup's messages
  popup.html/.css/.js  The toolbar popup: options, the test switch, progress.
                       With an archive, it continues in a tab, where the file dialog works
  history.html/.css   The history page, opened in a tab from the popup's History button:
  history-page.js      the list, search, type filter, downloads and clearing
  i18n.js              The pages' copy in English and Portuguese, and the language switch
_locales/              The extension's name and description in English and Portuguese
fonts/                 Geist, bundled (SIL Open Font License), so the popup fetches nothing
icons/                 Generated PNG icons (scripts/make-icons.mjs)
scripts/               Icon generation, test runner, packaging, and the ship helper
test/                  Node test suite (node --test)
web/                   The website (Next.js, Tailwind CSS), published to GitHub Pages
```

The website lives in [`web/`](web/README.md) and is published to GitHub Pages on every push to
`main` that touches it.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) to get set up, and the
[Code of Conduct](CODE_OF_CONDUCT.md). Found a security issue? See [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © Guilherme Kollet

Not affiliated with, or endorsed by, X Corp.
