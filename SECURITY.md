# Security Policy

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's **Report a vulnerability** button in the
repository's Security tab to send a private report, and include steps to reproduce.

## What matters most here

X Cleaner runs with your x.com session and can delete your posts, so we especially care about:

- **The extension talking to anywhere but x.com.** It must only ever call `x.com`, with the
  browser's own cookies. Anything that sends a request — or your archive, or post content — to any
  other host is a serious bug.
- **The archive leaving your machine.** The `.zip` you download from X is parsed in the browser and
  must never be uploaded.
- **Deleting the wrong things.** The type filters, the keep-list and the date range decide what is
  removed, and deletion is permanent. A filter that acts on items it shouldn't is in scope.
- **The permanent-deletion guardrails.** The acknowledgement, the typed `DELETE` confirmation and
  the test run exist so nobody wipes an account by accident. Anything that lets a full run start
  without them is in scope.
- **Widened permissions.** The extension asks only for `storage` and access to x.com/twitter.com.
  Any change that broadens that deserves scrutiny.
