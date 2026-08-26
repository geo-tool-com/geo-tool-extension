# Store screenshots

Rule: **screenshots show the real popup rendering a real score on a real
page** — no mocked UI, no invented numbers.

## What is in `store-assets/`

| File | What it shows |
| ---- | ------------- |
| `popup-de.png` / `popup-en.png` | The genuine popup (viewport capture) scoring the live `www.geo-tool.com` start page — 91/100 at capture time, category bars, real crawler excerpt |
| `store-de-1280x800.png` / `store-en-1280x800.png` | The same capture composed onto a plain brand backdrop with three verifiable claims — sized for Chrome Web Store / AMO / Edge (1280×800) |
| `social-preview.png` | 1280×640 GitHub social preview (upload under *Settings → Social preview* is a manual step) |

The scores in these images are whatever the engine computed at capture
time. When the page or the engine changes materially, recapture rather
than editing pixels.

## How they were captured

Headful Chrome under `xvfb-run`, driven by Puppeteer (maintainer tooling,
not part of this repo):

1. `npm ci && npm run build` — the popup under test is the real `dist/`.
2. `dist/` is copied to a `dist-shot/` harness copy and in the copy
   **only**: a one-line keepalive `background.service_worker` and
   `"host_permissions": ["<all_urls>"]` are added. Both exist because
   `chrome.action.openPopup()` called programmatically needs an extension
   context and does not grant `activeTab`. Popup code, styles, locales and
   the engine stay byte-identical; `dist-shot/` is never shipped.
3. The target page is opened in a tab, `chrome.action.openPopup()` is
   called from a helper extension page, and the popup viewport is captured
   once the score has rendered — once with `--lang=de`, once with
   `--lang=en`.
4. The 1280×800 store versions embed the capture unmodified on a plain
   backdrop (palette from `popup.css`). No fake browser chrome is drawn.

A manual toolbar click on the loaded `dist/` produces the identical
pixels — the harness only automates the click.

## Still open (see store-listing.md)

The suggested set also includes a client-rendered page showing the
JavaScript visibility gap and a blocked-crawlers view; those need suitable
public example pages and are not captured yet.
