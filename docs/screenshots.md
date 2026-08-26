# Store screenshots — capture procedure

Store listings (Chrome Web Store, AMO, Edge) need 1280×800 screenshots.
Rule: **screenshots show the real popup rendering a real score on a real
page** — no mocked UI, no invented numbers.

## Why they are not committed yet

Capturing needs a machine that can run headful Chrome with the extension
loaded. The repository owner's CI/VPS could not keep Chrome alive long
enough (an OOM guard there kills browser processes), so the capture runs
on a workstation instead. Until then the store listings simply have no
screenshots — that is visible in [store-listing.md](store-listing.md).

## Procedure (any workstation, Chrome ≥ 127)

1. `npm ci && npm run build` — the popup under test is the real `dist/`.
2. Copy `dist/` to `dist-shot/` and in the copy **only**:
   - add `"background": {"service_worker": "shot-sw.js"}` with a one-line
     keepalive worker, and
   - add `"host_permissions": ["<all_urls>"]`.
   The popup code, styles, locales, and engine stay byte-identical; the two
   manifest additions exist because `chrome.action.openPopup()` called
   programmatically needs a service-worker context and does not grant
   `activeTab`. `dist-shot/` is a capture harness, never shipped.
3. Load `dist-shot/` unpacked, open the page to score, click the toolbar
   icon (or call `chrome.action.openPopup()` from the harness worker),
   wait for the score, and capture the popup at `deviceScaleFactor: 2`.
   Run once with `--lang=de` and once with `--lang=en`.
4. Compose the popup capture onto a plain 1280×800 backdrop (brand colors
   from `popup.css`). Do not draw fake browser chrome around it.

An automated Puppeteer version of steps 2–3 exists in the maintainers'
tooling; the manual click path produces the identical pixels.
