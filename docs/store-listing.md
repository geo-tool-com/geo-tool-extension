# Store listing & submission

Everything needed to launch in the Chrome Web Store, Firefox Add-ons (AMO),
and Edge Add-ons. The packaged ZIP is produced by `npm run zip`
(→ `geo-check-extension.zip`).

## Listing texts

**Name (DE):** GEO Check — sieht ChatGPT deine Seite?
**Name (EN):** GEO Check — can ChatGPT read your page?

**Short (DE):** Prüft jede Seite auf KI-Lesbarkeit: Crawler-Zugang, Schema,
Antwortstruktur. Läuft komplett im Browser — auch auf Staging und hinter Login.
**Short (EN):** Checks any page for AI readability: crawler access, schema,
answer structure. Runs entirely in your browser — including staging and
behind login.

**Long (EN):**
GEO Check scores the open tab 0–100 for AI search readiness — the same score
as the free audit on geo-tool.com. It answers four questions in one click:
Can AI crawlers (GPTBot, ClaudeBot, PerplexityBot, …) access this page? Is
the content readable without JavaScript? Is there schema markup? Would an AI
answer quote this content? Because it runs inside your browser, it can check
what no server-side tool can reach: staging environments, localhost, and
pages behind login. No account, no tracking, no data collection — the
extension never contacts any backend.

**Category:** Developer Tools · **Language:** de, en
**Support URL:** https://www.geo-tool.com/de/contact
**Homepage:** https://www.geo-tool.com
**Privacy policy URL:** https://www.geo-tool.com/de/datenschutz

## Chrome Web Store privacy questionnaire

- **Single purpose:** Score the currently open page for AI-search readability.
- **Data collection:** none. The extension collects, stores, and transmits no
  user data. There is no analytics, no error reporting, no backend.
- **Permission justifications:**
  - `activeTab` — read the page the user explicitly checks (one click on the
    toolbar icon); all fetches (page HTML, robots.txt, llms.txt) stay
    same-origin to that tab.
  - `scripting` — inject the collector into the active tab on click to read
    the rendered DOM; no content scripts run automatically on any site.
- **Remote code:** none (single bundled file, no eval, no remote scripts).

## Firefox (AMO)

- `browser_specific_settings.gecko.id` = `geo-check@geo-tool.com` (already in
  the manifest), minimum version 121.
- Submit the same ZIP at addons.mozilla.org (free account). AMO reviews and
  signs; source is public in this repository, which reviewers appreciate.
- MV3 with `activeTab` + `scripting` is supported in current Firefox.

## Edge Add-ons

Accepts the Chrome package unchanged. Free developer account at
partner.microsoft.com; same texts and privacy answers.

## What only the account owner can do

1. Chrome: developer account (one-time $5), then upload
   `geo-check-extension.zip`, paste the texts above, answer the privacy
   questionnaire, add screenshots (1280×800, 1–5), submit for review
   (typically 1–3 days).
2. Firefox: free AMO account, same ZIP, same texts.
3. Edge: free account, same package.

## Screenshots

1280×800 PNG. Suggested set:

1. Popup verdict on a well-optimized page (green score, category bars)
2. Popup on a client-rendered page showing the JavaScript visibility gap
3. Blocked-crawlers view on a site whose robots.txt locks out GPTBot
4. The shareable report page the popup links to
