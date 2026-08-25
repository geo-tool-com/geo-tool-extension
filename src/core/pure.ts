// Reine, isomorphe Kernlogik des GEO-Technik-Checks: Typen, Gewichts-Semantik
// und HTML-Auswertung. KEINE Netzwerk-, Node- oder Next-Abhaengigkeit — dieses
// Modul laeuft unveraendert im Server-Check UND in der Browser-Extension, damit
// beide exakt denselben Score sprechen. Wer hier etwas ergaenzt, das `fetch`,
// `process` oder ein Next-Import braucht, gehoert nach technical-check.ts.

export type TechnicalFindingStatus = 'pass' | 'warn' | 'fail'

// Ein Check, zwei Sprachen: Labels und Detail-Texte folgen der Sprache des
// Aufrufers (Report-Sprache, Workspace-Locale) — gemischtsprachige Reports
// waren der letzte Rest „unfertig" im EN-Funnel.
export type TechnicalCheckLang = 'de' | 'en'

export type TechnicalFinding = {
  id: string
  label: string
  status: TechnicalFindingStatus
  detail: string
  weight: number
}

// Ein fehlendes Signal ("warn") darf nicht die halbe Punktzahl einbringen —
// sonst hat eine Seite, die nichts richtig macht, trotzdem einen hohen Boden.
// Kalibriert am 2026-08-10; gilt fuer JEDE Score-Berechnung der Engine
// (Technik-Check, Content-Readiness, Report-Kategorien), damit Gratis-Check
// und bezahlter Workspace dieselbe warn-Semantik verwenden.
export const WARN_CREDIT = 0.35

export function earnedWeight(findings: TechnicalFinding[]): number {
  return findings.reduce(
    (sum, finding) =>
      sum + (finding.status === 'pass' ? finding.weight : finding.status === 'warn' ? finding.weight * WARN_CREDIT : 0),
    0
  )
}

// KI-Crawler, deren Aussperrung GEO-Sichtbarkeit direkt verhindert.
export const AI_BOTS = ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'OAI-SearchBot']

export function stripTags(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function firstMatch(html: string, pattern: RegExp): string | null {
  const match = html.match(pattern)
  return match?.[1]?.trim() ?? null
}

export function extractSchemaTypes(html: string): string[] {
  const types = new Set<string>()
  const blocks = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script\s*>/gi) ?? []
  for (const block of blocks) {
    const body = block.replace(/^<script[^>]*>/i, '').replace(/<\/script\s*>$/i, '')
    try {
      const parsed = JSON.parse(body.trim()) as unknown
      collectSchemaTypes(parsed, types)
    } catch {
      // Ungültiges JSON-LD zählt nicht als Schema — genau das wollen wir messen.
    }
  }
  return Array.from(types)
}

function collectSchemaTypes(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectSchemaTypes(item, into)
    return
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const type = record['@type']
    if (typeof type === 'string') into.add(type)
    if (Array.isArray(type)) for (const t of type) if (typeof t === 'string') into.add(t)
    for (const key of Object.keys(record)) {
      if (key === '@type') continue
      collectSchemaTypes(record[key], into)
    }
  }
}

/**
 * Welche der uebergebenen Bots die robots.txt komplett aussperrt.
 *
 * Die Vorgabe sind die fuenf Crawler, deren Aussperrung in den Score einfliesst.
 * Das oeffentliche Crawler-Tool reicht eine laengere Liste herein — die Regel,
 * wann ein Bot als gesperrt gilt, bleibt dieselbe.
 */
export function robotsBlocksAiBots(robotsTxt: string, bots: readonly string[] = AI_BOTS): string[] {
  if (!robotsTxt) return []
  const sections = robotsTxt.split(/(?=^\s*user-agent\s*:)/gim)
  const sectionFor = (agent: string) =>
    sections.find(
      (section) =>
        section.match(/^\s*user-agent\s*:\s*(.+)$/im)?.[1]?.trim().toLowerCase() === agent
    )
  const disallowsAll = (section: string | undefined) =>
    Boolean(section && /^\s*disallow\s*:\s*\/\s*$/im.test(section) && !/^\s*allow\s*:\s*\/\s*$/im.test(section))

  // Eine Wildcard-Sperre ("User-agent: * / Disallow: /") sperrt KI-Crawler
  // genauso aus — es sei denn, ein Bot hat eine eigene, mildere Sektion.
  const wildcard = sectionFor('*')
  const blocked: string[] = []
  for (const bot of bots) {
    const own = sectionFor(bot.toLowerCase())
    if (own ? disallowsAll(own) : disallowsAll(wildcard)) blocked.push(bot)
  }
  return blocked
}

export const THIN_HTML_WORD_THRESHOLD = 150
