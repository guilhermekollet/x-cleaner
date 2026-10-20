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
- **A test run** that stops after 5, so you can confirm it deletes the right things first.
- **Pause, resume and stop**, and a saved progress list so an interrupted run continues where it
  left off instead of starting over.

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
4. Leave **Test run** on, tick **I understand deletion is permanent**, and click **Start**.
5. Check that the 5 it removed were the right ones. Then turn **Test run** off, type `DELETE` to
   confirm, and start again.

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

The extension requests only the `storage` permission and access to `x.com` / `twitter.com`.

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

The tests cover the two pieces that are easy to get wrong and run without a browser: the archive
reader (including the hand-written ZIP extraction) and the engine's filtering rules.

## Project layout

```
manifest.json          Manifest V3: the popup, and the content scripts injected on x.com
src/
  x-api.js             Talks to x.com's GraphQL API: reads query IDs and feature flags from the
                       live page, lists timelines, deletes posts and reposts, removes likes
  archive.js           Reads the "Download an archive of your data" file (.zip or loose .js),
                       including a dependency-free ZIP reader
  engine.js            The run: ordering, batching, pacing, rate-limit waits, pause/resume,
                       progress saved for resuming
  content.js           Runs on the x.com tab; holds the engine and answers the popup's messages
  popup.html/.css/.js  The toolbar popup: options, the permanent-deletion confirmation, progress
icons/                 Generated PNG icons (scripts/make-icons.mjs)
scripts/               Icon generation, test runner, packaging, and the ship helper
test/                  Node test suite (node --test)
```

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) to get set up, and the
[Code of Conduct](CODE_OF_CONDUCT.md). Found a security issue? See [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © Guilherme Kollet

Not affiliated with, or endorsed by, X Corp.
