# Contributing to X Cleaner

Thanks for helping! This guide covers how to set up the project, what we expect from a change and
how to get it merged.

## Setup

There is no build step and there are no dependencies.

1. Node 20 or later (the tests use the global `File` class and `DecompressionStream`).
2. Clone the repository.
3. Run the tests: `scripts/test.sh`.
4. Load the folder as an unpacked extension (see the README's Install section) to try it on x.com.

## Making a change

- **Open an issue first** for anything bigger than a small fix, so we can agree on the approach.
- **Keep pull requests focused**: one change per PR, with a description of what and why.
- **Match the surrounding code**: small modules, plain JavaScript, no dependencies and no build
  step. Comments explain *why*, not *what*. Code and comments are in English.
- **Add or update tests** for logic you touch, under `test/` (`node --test`). The pieces worth
  testing are the ones that run without a browser — archive parsing and the engine's filtering.
  Browser-only code (the API client, the content script) is verified by hand on x.com.
- **Check it still works**: `scripts/test.sh`, then load the unpacked extension and run a **test
  run** (5 items) on a real account before and after your change.
- **Privacy is a feature**: the extension must talk only to x.com and must never upload the archive
  or any post content. Call out anything that would change that.
- **Pace responsibly**: don't lower the default delays. Getting people rate-limited or locked out is
  worse than a slow run.

## Commit messages

Use the [Conventional Commits](https://www.conventionalcommits.org) style, in English, for example
`feat: add a likes-only mode` or `fix(engine): wait the full reset window on a 429`.
No co-author or "generated with" trailers.

`scripts/ship.sh` does the whole round and checks the convention at each step:

```bash
scripts/ship.sh setup                                   # once: check every commit message
scripts/ship.sh branch fix/reset-wait
git add -p
scripts/ship.sh commit "fix(engine): wait the full reset window on a 429" body.txt
scripts/ship.sh push
scripts/ship.sh pr                                      # title and description from the commit
scripts/ship.sh merge 7                                 # maintainers: squash once checks pass
```

## Reporting bugs

Use the bug report template. When a run halts, include the message the popup showed and, if you can,
the failing request's status from the browser's DevTools Network tab — that is what tells us whether
X changed its API.
