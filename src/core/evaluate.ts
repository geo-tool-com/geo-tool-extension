// Auswertung des Technik-Checks: aus gesammelten Beobachtungen (PageEvidence)
// werden Findings und Score. Bewusst OHNE Netzwerk — wer die Evidence liefert,
// entscheidet der Aufrufer:
//   * Server  -> technical-check.ts holt Seite, robots.txt und llms.txt per fetch
//   * Browser -> die Extension liest DOM und same-origin-Dateien im Tab des
//                Nutzers, ohne einen einzigen Aufruf an geo-tool.com
// Beide Wege muessen denselben Score liefern; genau dafuer existiert dieses
// Modul. Aenderungen an Gewichten oder Schwellen gehoeren ausschliesslich
// hierher, nie in einen der beiden Aufrufer.

import {
  earnedWeight,
  extractSchemaTypes,
  firstMatch,
  robotsBlocksAiBots,
  stripTags,
  THIN_HTML_WORD_THRESHOLD,
  type TechnicalCheckLang,
  type TechnicalFinding,
  type TechnicalFindingStatus,
} from './pure'

/**
 * Woher das ausgewertete HTML stammt.
 * `direct`      = so, wie der Server es ausliefert (keine JS-Ausfuehrung)
 * `proxy`       = ueber den Render-Proxy nachgeladen (kostet pro Aufruf)
 * `browser-dom` = fertig gerendertes DOM aus dem Tab des Nutzers (Extension)
 */
export type RenderedSource = 'direct' | 'proxy' | 'browser-dom'

export type PageEvidence = {
  /** Endgueltige URL nach Redirects — Grundlage des HTTPS-Befunds. */
  finalUrl: string
  httpStatus: number | null
  responseMs: number | null
  /** Direktzugriff war blockiert; Inhalt kam nur ueber den Render-Proxy. */
  blockedDirectAccess: boolean
  /** Das ausgewertete HTML. */
  html: string
  /** Wortzahl im ROHEN, nicht gerenderten HTML — null, wenn nicht ermittelbar. */
  directWordCount: number | null
  renderedSource: RenderedSource
  /** Inhalt der robots.txt; null bedeutet "nicht abrufbar", nicht "leer". */
  robotsTxt: string | null
  llmsTxtFound: boolean
  lang?: TechnicalCheckLang
}

export type TechnicalEvaluation = {
  findings: TechnicalFinding[]
  schemaTypes: string[]
  wordCount: number
  score: number
}

/** Klammerzusatz beim Inhaltsvolumen — je nachdem, wie gerendert wurde. */
function renderNote(source: RenderedSource, en: boolean): string {
  if (source === 'proxy') {
    return en
      ? ' (JS-rendered via proxy — plain HTML crawlers see less)'
      : ' (JS-gerendert via Proxy — reine HTML-Crawler sehen weniger)'
  }
  if (source === 'browser-dom') {
    return en
      ? ' (measured in the rendered DOM — plain HTML crawlers see less)'
      : ' (im gerenderten DOM gemessen — reine HTML-Crawler sehen weniger)'
  }
  return ''
}

export function scoreFromFindings(findings: TechnicalFinding[]): number {
  const totalWeight = findings.reduce((sum, finding) => sum + finding.weight, 0)
  return totalWeight ? Math.round((earnedWeight(findings) / totalWeight) * 100) : 0
}

/**
 * Der Befund fuer eine Seite, die gar nicht antwortet. Gewicht 100, damit der
 * Score zwingend 0 wird — eine unerreichbare Seite ist nicht zitierbar.
 */
export function evaluateUnreachable(
  evidence: Pick<PageEvidence, 'httpStatus' | 'lang'>
): TechnicalFinding[] {
  const en = evidence.lang === 'en'
  const findings: TechnicalFinding[] = []
  const add = (id: string, label: string, status: TechnicalFindingStatus, detail: string, weight: number) =>
    findings.push({ id, label, status, detail, weight })

  add(
    'reachable',
    en ? 'Page reachable' : 'Seite erreichbar',
    'fail',
    evidence.httpStatus
      ? en
        ? `The page responds with HTTP ${evidence.httpStatus} — AI crawlers cannot read it.`
        : `Die Seite antwortet mit HTTP ${evidence.httpStatus} — KI-Crawler können sie nicht lesen.`
      : en
        ? 'The page did not respond (timeout or network error) — without a response there is nothing to cite.'
        : 'Die Seite war nicht erreichbar (Timeout oder Netzwerkfehler) — ohne Antwort keine Zitierbarkeit.',
    100
  )
  return findings
}

export function evaluateTechnicalFindings(evidence: PageEvidence): TechnicalEvaluation {
  const en = evidence.lang === 'en'
  const usedRenderedHtml = evidence.renderedSource !== 'direct'
  const text = stripTags(evidence.html)
  const wordCount = text ? text.split(/\s+/).length : 0

  const findings: TechnicalFinding[] = []
  const add = (id: string, label: string, status: TechnicalFindingStatus, detail: string, weight: number) =>
    findings.push({ id, label, status, detail, weight })

  add(
    'reachable',
    en ? 'Page reachable' : 'Seite erreichbar',
    evidence.blockedDirectAccess ? 'warn' : 'pass',
    evidence.blockedDirectAccess
      ? en
        ? `Direct access blocked (${evidence.httpStatus ? `HTTP ${evidence.httpStatus}` : 'no response'}) — content checked via render proxy. Verify whether your bot protection also locks out GPTBot, ClaudeBot & co.`
        : `Direktzugriff blockiert (${evidence.httpStatus ? `HTTP ${evidence.httpStatus}` : 'keine Antwort'}) — Inhalt via Render-Proxy geprüft. Prüfe, ob der Bot-Schutz auch GPTBot, ClaudeBot & Co. aussperrt.`
      : `HTTP ${evidence.httpStatus} in ${evidence.responseMs ?? '?'} ms.`,
    15
  )

  const isHttps = evidence.finalUrl.startsWith('https://')
  add(
    'https',
    'HTTPS',
    isHttps ? 'pass' : 'fail',
    isHttps
      ? en
        ? 'The page is served over HTTPS.'
        : 'Die Seite wird über HTTPS ausgeliefert.'
      : en
        ? 'Without HTTPS, AI search and browsers downgrade the page.'
        : 'Ohne HTTPS werten KI-Suchen und Browser die Seite ab.',
    8
  )

  const responseMs = evidence.responseMs ?? 0
  add(
    'speed',
    en ? 'Response time' : 'Antwortzeit',
    responseMs <= 1500 ? 'pass' : responseMs <= 4000 ? 'warn' : 'fail',
    en
      ? `First response after ${responseMs} ms${responseMs > 1500 ? ' — crawlers abandon slow pages more often.' : '.'}`
      : `Erste Antwort nach ${responseMs} ms${responseMs > 1500 ? ' — Crawler brechen langsame Seiten häufiger ab.' : '.'}`,
    8
  )

  const robotsMeta = firstMatch(evidence.html, /<meta[^>]*name=["']robots["'][^>]*content=["']([^"']*)["']/i) ?? ''
  const noindex = /noindex/i.test(robotsMeta)
  add(
    'indexable',
    en ? 'Indexable' : 'Indexierbar',
    noindex ? 'fail' : 'pass',
    noindex
      ? en
        ? `The robots meta tag contains "${robotsMeta}" — the page forbids inclusion in search indexes.`
        : `robots-Meta enthält "${robotsMeta}" — die Seite verbietet die Aufnahme in Suchindizes.`
      : en
        ? 'No noindex — the page may appear in search and AI answers.'
        : 'Kein noindex — die Seite darf in Suche und KI-Antworten erscheinen.',
    15
  )

  const blockedBots = evidence.robotsTxt ? robotsBlocksAiBots(evidence.robotsTxt) : []
  add(
    'ai-bots',
    en ? 'AI crawlers allowed' : 'KI-Crawler erlaubt',
    blockedBots.length ? 'fail' : 'pass',
    blockedBots.length
      ? en
        ? `robots.txt fully blocks ${blockedBots.join(', ')} — these AI search engines can never cite the page.`
        : `robots.txt sperrt ${blockedBots.join(', ')} komplett aus — diese KI-Suchen können die Seite nie zitieren.`
      : en
        ? 'robots.txt does not block any of the relevant AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended).'
        : 'robots.txt sperrt keinen der relevanten KI-Crawler (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) aus.',
    12
  )

  const title = firstMatch(evidence.html, /<title[^>]*>([\s\S]*?)<\/title>/i)
  add(
    'title',
    en ? 'Title tag' : 'Title-Tag',
    title && title.length >= 10 && title.length <= 75 ? 'pass' : title ? 'warn' : 'fail',
    title
      ? en
        ? `"${title.slice(0, 80)}" (${title.length} characters${title.length > 75 ? ' — too long' : title.length < 10 ? ' — too short' : ''}).`
        : `"${title.slice(0, 80)}" (${title.length} Zeichen${title.length > 75 ? ' — zu lang' : title.length < 10 ? ' — zu kurz' : ''}).`
      : en
        ? 'No title tag — search and AI answers need it as the primary label.'
        : 'Kein Title-Tag — Suchen und KI-Antworten brauchen ihn als primäres Label.',
    10
  )

  const metaDescription = firstMatch(evidence.html, /<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)
  add(
    'meta-description',
    'Meta-Description',
    metaDescription && metaDescription.length >= 50 ? 'pass' : metaDescription ? 'warn' : 'fail',
    metaDescription
      ? en
        ? `${metaDescription.length} characters.`
        : `${metaDescription.length} Zeichen.`
      : en
        ? 'No meta description — the answer preview is left to chance.'
        : 'Keine Meta-Description — die Antwortvorschau bleibt dem Zufall überlassen.',
    6
  )

  const h1Matches = evidence.html.match(/<h1[\s>]/gi) ?? []
  add(
    'h1',
    en ? 'Exactly one H1' : 'Genau eine H1',
    h1Matches.length === 1 ? 'pass' : h1Matches.length === 0 ? 'fail' : 'warn',
    h1Matches.length === 1
      ? en
        ? 'The page has exactly one H1.'
        : 'Die Seite hat genau eine H1.'
      : h1Matches.length === 0
        ? en
          ? 'No H1 found — the core question of the page stays unclear to machines.'
          : 'Keine H1 gefunden — die Kernfrage der Seite bleibt für Maschinen unklar.'
        : en
          ? `${h1Matches.length} H1 tags found — one clear main heading is easier to extract.`
          : `${h1Matches.length} H1-Tags gefunden — eine klare Haupt-Überschrift ist besser extrahierbar.`,
    8
  )

  const canonical = firstMatch(evidence.html, /<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["']/i)
  add(
    'canonical',
    'Canonical',
    canonical ? 'pass' : 'warn',
    canonical
      ? en
        ? `Canonical points to ${canonical.slice(0, 90)}.`
        : `Canonical zeigt auf ${canonical.slice(0, 90)}.`
      : en
        ? 'No canonical tag — duplicates can dilute citability.'
        : 'Kein Canonical-Tag — Duplikate können die Zitierfähigkeit verwässern.',
    6
  )

  const schemaTypes = extractSchemaTypes(evidence.html)
  add(
    'schema',
    en ? 'Structured data (JSON-LD)' : 'Strukturierte Daten (JSON-LD)',
    schemaTypes.length ? 'pass' : 'fail',
    schemaTypes.length
      ? en
        ? `Detected types: ${schemaTypes.slice(0, 6).join(', ')}${schemaTypes.includes('FAQPage') ? ' — FAQPage is ideal for AI answers.' : '.'}`
        : `Gefundene Typen: ${schemaTypes.slice(0, 6).join(', ')}${schemaTypes.includes('FAQPage') ? ' — FAQPage ist ideal für KI-Antworten.' : '.'}`
      : en
        ? 'No valid JSON-LD — structured data is the most direct route into AI answers.'
        : 'Kein gültiges JSON-LD — strukturierte Daten sind der direkteste Weg in KI-Antworten.',
    12
  )

  add(
    'llms-txt',
    'llms.txt',
    evidence.llmsTxtFound ? 'pass' : 'warn',
    evidence.llmsTxtFound
      ? en
        ? 'llms.txt is present — AI crawlers get curated context.'
        : 'llms.txt ist vorhanden — KI-Crawler bekommen kuratierten Kontext.'
      : en
        ? 'No llms.txt on the domain — optional, but an easy GEO signal.'
        : 'Keine llms.txt auf der Domain — optional, aber ein einfaches GEO-Signal.',
    4
  )

  add(
    'content-volume',
    en ? 'Readable content' : 'Lesbarer Inhalt',
    wordCount >= 300 ? 'pass' : wordCount >= 100 ? 'warn' : 'fail',
    en
      ? `${wordCount} words${renderNote(evidence.renderedSource, true)}${wordCount < 300 ? ' — on client-side rendered pages crawlers may see almost nothing' : ''}.`
      : `${wordCount} Wörter${renderNote(evidence.renderedSource, false)}${wordCount < 300 ? ' — bei client-seitig gerenderten Seiten sehen Crawler ggf. fast nichts' : ''}.`,
    10
  )

  // Der Befund, der wehtut: Kein großer KI-Crawler führt JavaScript aus
  // (Vercel, "The Rise of the AI Crawler" — GPTBot, ClaudeBot, PerplexityBot
  // lesen nur das ausgelieferte HTML). Steht der Inhalt erst nach dem Rendern
  // im DOM, ist die Seite für diese Systeme fast leer. Wir MESSEN das: rohes
  // HTML vs. gerendertes HTML, beide Wortzahlen nebeneinander.
  if (evidence.directWordCount !== null) {
    const jsOnly = usedRenderedHtml && evidence.directWordCount < THIN_HTML_WORD_THRESHOLD
    add(
      'js-visibility',
      en ? 'Content readable without JavaScript' : 'Inhalt ohne JavaScript lesbar',
      jsOnly ? (evidence.directWordCount < 50 ? 'fail' : 'warn') : 'pass',
      jsOnly
        ? en
          ? `Without JavaScript the HTML contains only ${evidence.directWordCount} words — after rendering ${wordCount}. No major AI crawler executes JavaScript: for ChatGPT, Claude & Perplexity this page is nearly empty. Your answer exists for humans, not for machines.`
          : `Ohne JavaScript stehen nur ${evidence.directWordCount} Wörter im HTML — nach dem Rendern ${wordCount}. Kein großer KI-Crawler führt JavaScript aus: für ChatGPT, Claude & Perplexity ist diese Seite fast leer. Deine Antwort existiert für Menschen, nicht für Maschinen.`
        : en
          ? `The content is in the delivered HTML (${evidence.directWordCount} words) — readable without JavaScript.`
          : `Der Inhalt steht im ausgelieferten HTML (${evidence.directWordCount} Wörter) — auch ohne JavaScript lesbar.`,
      12
    )
  }

  const viewport = /<meta[^>]*name=["']viewport["']/i.test(evidence.html)
  add(
    'viewport',
    en ? 'Mobile viewport' : 'Mobile Viewport',
    viewport ? 'pass' : 'warn',
    viewport
      ? en
        ? 'Viewport meta present.'
        : 'Viewport-Meta vorhanden.'
      : en
        ? 'No viewport meta — mobile rendering is a baseline ranking signal.'
        : 'Kein Viewport-Meta — Mobil-Darstellung ist ein Ranking-Basissignal.',
    4
  )
  return { findings, schemaTypes, wordCount, score: scoreFromFindings(findings) }
}
