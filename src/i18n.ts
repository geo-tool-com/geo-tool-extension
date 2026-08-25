// Kein neues Uebersetzungssystem: Findings und Detailtexte kommen bereits
// zweisprachig aus dem Kern. Hier stehen nur die Worte der Huelle.

export type Lang = 'de' | 'en'

type Copy = {
  verdict: { good: string; mixed: string; bad: string }
  verdictNote: (readiness: string) => string
  crawlerHeading: string
  human: string
  machine: string
  readoutEmpty: string
  readoutUnavailable: string
  categories: Record<string, string>
  findingsHeading: string
  noFindings: string
  more: (count: number) => string
  copy: string
  copied: string
  cta: string
  markdownFooter: string
  restrictedTitle: string
  restrictedBody: string
  blockedTitle: string
  blockedBody: string
  errorTitle: string
  errorBody: string
}

export const COPY: Record<Lang, Copy> = {
  de: {
    verdict: {
      good: 'Lesbar für KI-Crawler',
      mixed: 'Teilweise lesbar',
      bad: 'Für KI-Crawler kaum vorhanden',
    },
    verdictNote: (readiness) => `GEO-Bereitschaft: ${readiness}. Gleiche Rechnung wie auf geo-tool.com.`,
    crawlerHeading: 'Das bekommt ein Crawler',
    human: 'Mensch',
    machine: 'Crawler',
    readoutEmpty:
      'Das ausgelieferte HTML enthält keinen Text. Kein großer KI-Crawler führt JavaScript aus — für ChatGPT, Claude und Perplexity ist diese Seite leer.',
    readoutUnavailable: 'Das rohe HTML war nicht abrufbar — der JavaScript-Befund entfällt, statt geraten zu werden.',
    categories: {
      directAnswers: 'Direkte Antworten',
      structure: 'Struktur',
      schemaMarkup: 'Schema Markup',
      citations: 'Belege im Inhalt',
      multimedia: 'Multimedia',
      platformSpecific: 'System-Bereitschaft',
    },
    findingsHeading: 'Was im Weg steht',
    noFindings: 'Kein Befund. Diese Seite besteht jede Prüfung.',
    more: (count) => `+ ${count} weitere Befunde im vollen Report.`,
    copy: 'Ergebnis kopieren',
    copied: 'Kopiert',
    cta: 'Voller Report →',
    markdownFooter: 'Gemessen mit dem GEO Check —',
    restrictedTitle: 'Hier darf keine Extension mitlesen',
    restrictedBody: 'Chrome-eigene Seiten und der Web Store sind gesperrt. Öffne eine normale Website.',
    blockedTitle: 'Seite nicht lesbar',
    blockedBody: 'Chrome hat den Zugriff auf diesen Tab verweigert. Lade die Seite neu und versuche es erneut.',
    errorTitle: 'Prüfung fehlgeschlagen',
    errorBody: 'Die Seite ließ sich nicht auswerten. Neu laden und noch einmal versuchen.',
  },
  en: {
    verdict: {
      good: 'Readable for AI crawlers',
      mixed: 'Partly readable',
      bad: 'Barely there for AI crawlers',
    },
    verdictNote: (readiness) => `GEO readiness: ${readiness}. Same maths as on geo-tool.com.`,
    crawlerHeading: 'What a crawler gets',
    human: 'Human',
    machine: 'Crawler',
    readoutEmpty:
      'The delivered HTML contains no text. No major AI crawler executes JavaScript — for ChatGPT, Claude and Perplexity this page is empty.',
    readoutUnavailable: 'The raw HTML could not be fetched — the JavaScript finding is skipped rather than guessed.',
    categories: {
      directAnswers: 'Direct answers',
      structure: 'Structure',
      schemaMarkup: 'Schema markup',
      citations: 'Evidence in content',
      multimedia: 'Multimedia',
      platformSpecific: 'System readiness',
    },
    findingsHeading: 'What is in the way',
    noFindings: 'Nothing found. This page passes every check.',
    more: (count) => `+ ${count} more findings in the full report.`,
    copy: 'Copy result',
    copied: 'Copied',
    cta: 'Full report →',
    markdownFooter: 'Measured with the GEO Check —',
    restrictedTitle: 'No extension may read this page',
    restrictedBody: 'Chrome pages and the Web Store are off limits. Open a regular website.',
    blockedTitle: 'Page not readable',
    blockedBody: 'Chrome denied access to this tab. Reload the page and try again.',
    errorTitle: 'Check failed',
    errorBody: 'The page could not be evaluated. Reload and try again.',
  },
}
