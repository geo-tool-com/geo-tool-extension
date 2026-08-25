# GEO Check — browser extension

**Can ChatGPT read the page you are looking at?** One click on the toolbar
icon scores the open tab for AI readability: crawler access, schema markup,
answer structure, and what the content looks like without JavaScript —
scored 0–100 by the same engine as [geo-tool.com](https://www.geo-tool.com).

**Everything runs in your browser.** The extension never calls geo-tool.com
or any other backend — the build fails if a network path slips into the
bundle. That is why it can check what no server-side tool can:

|                                        | Website audit                | Extension                   |
| -------------------------------------- | ---------------------------- | --------------------------- |
| Pages behind login, staging, localhost | not reachable                | checkable                   |
| Response time                          | synthetic, from one region   | your real connection        |
| JavaScript visibility gap              | needs a paid render proxy    | the rendered DOM is present |

## Install

- Chrome Web Store / Firefox Add-ons: listing in progress — see
  [docs/store-listing.md](docs/store-listing.md)
- From source: `npm ci && npm run build`, then load `dist/` as an unpacked
  extension (`chrome://extensions` → Developer mode → Load unpacked).

## Privacy — the two rules

1. **No proxy.** All three requests (page, `robots.txt`, `llms.txt`) are
   same-origin to the active tab, which is why `activeTab` + `scripting` are
   the only permissions. What cannot be fetched same-origin is reported as
   "not checkable" — never routed through a server.
2. **No telemetry.** No version ping, no usage tracking, no result logging.
   The only contact with geo-tool.com is a link the user clicks.

The extension collects no data. Privacy policy:
[geo-tool.com/de/datenschutz](https://www.geo-tool.com/de/datenschutz).

## Architecture

`src/core/` is the scoring engine, vendored byte-identical from the
geo-tool.com monorepo (same rule as
[geo-tool-check](https://github.com/geo-tool-com/geo-tool-check), the CLI/MCP
sibling): extension, CLI, and website always compute the identical score.
Scoring changes land upstream first. `src/collect.ts` gathers evidence from
the open tab (rendered DOM, raw HTML via same-origin fetch, robots.txt,
llms.txt); `src/popup.ts` renders the verdict and builds the shareable
report link.

Share links encode the check result client-side (see `src/core/share-payload.ts`)
and open a report page on geo-tool.com — that navigation is user-initiated
and carries no identifiers beyond the check result itself.

## License

MIT. Built by [track by track GmbH](https://www.geo-tool.com).
