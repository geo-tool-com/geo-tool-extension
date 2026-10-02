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

export type SchemaNode = Record<string, unknown>

export type SchemaExtraction = {
  /** Alle Objekte mit `@type`, auch verschachtelte (publisher, author, @graph). */
  nodes: SchemaNode[]
  blocks: number
  /** JSON-LD-Bloecke, die sich nicht parsen lassen — fuer Maschinen unsichtbar. */
  invalidBlocks: number
}

export function extractSchema(html: string): SchemaExtraction {
  const nodes: SchemaNode[] = []
  let invalidBlocks = 0
  const blocks = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script\s*>/gi) ?? []
  for (const block of blocks) {
    const body = block.replace(/^<script[^>]*>/i, '').replace(/<\/script\s*>$/i, '')
    try {
      const parsed = JSON.parse(body.trim()) as unknown
      collectSchemaNodes(parsed, nodes)
    } catch {
      // Ungültiges JSON-LD zählt nicht als Schema — genau das wollen wir messen.
      invalidBlocks += 1
    }
  }
  return { nodes, blocks: blocks.length, invalidBlocks }
}

export function schemaNodeTypes(node: SchemaNode): string[] {
  const type = node['@type']
  if (typeof type === 'string') return [type]
  if (Array.isArray(type)) return type.filter((t): t is string => typeof t === 'string')
  return []
}

export function extractSchemaTypes(html: string): string[] {
  const types = new Set<string>()
  for (const node of extractSchema(html).nodes) for (const type of schemaNodeTypes(node)) types.add(type)
  return Array.from(types)
}

function collectSchemaNodes(value: unknown, into: SchemaNode[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectSchemaNodes(item, into)
    return
  }
  if (value && typeof value === 'object') {
    const record = value as SchemaNode
    if (schemaNodeTypes(record).length) into.push(record)
    for (const key of Object.keys(record)) {
      if (key === '@type') continue
      collectSchemaNodes(record[key], into)
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

// Agenten, die fuer Suche und KI-Antworten abrufen. Ein Crawl-delay fuer sie
// bremst die Entdeckung, ohne etwas zu schuetzen.
export const SEARCH_AGENTS = [
  'Googlebot', 'bingbot', 'OAI-SearchBot', 'PerplexityBot', 'Claude-SearchBot',
  'ChatGPT-User', 'Claude-User', 'Perplexity-User',
]

function robotsSections(robotsTxt: string): Array<{ agents: string[]; body: string }> {
  // Mehrere User-agent-Zeilen direkt hintereinander teilen sich einen Block.
  const sections: Array<{ agents: string[]; body: string }> = []
  let current: { agents: string[]; body: string } | null = null
  let lastWasAgent = false
  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (!line) continue
    const agent = line.match(/^user-agent\s*:\s*(.+)$/i)?.[1]?.trim().toLowerCase()
    if (agent) {
      if (!current || !lastWasAgent) {
        current = { agents: [], body: '' }
        sections.push(current)
      }
      current.agents.push(agent)
      lastWasAgent = true
      continue
    }
    lastWasAgent = false
    if (current) current.body += `${line}\n`
  }
  return sections
}

/** Such- und KI-Agenten, fuer die ein Crawl-delay gilt (eigene Sektion vor Wildcard). */
export function robotsCrawlDelayAgents(robotsTxt: string, agents: readonly string[] = SEARCH_AGENTS): string[] {
  if (!robotsTxt) return []
  const sections = robotsSections(robotsTxt)
  const hasDelay = (body: string | undefined) => Boolean(body && /^crawl-delay\s*:\s*\d/im.test(body))
  const wildcard = sections.find((section) => section.agents.includes('*'))
  return agents.filter((agent) => {
    const own = sections.find((section) => section.agents.includes(agent.toLowerCase()))
    return hasDelay((own ?? wildcard)?.body)
  })
}

export function robotsSitemaps(robotsTxt: string): string[] {
  return Array.from(robotsTxt.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim), (match) => match[1] ?? '').filter(Boolean)
}

/** Inhalt eines `<meta property|name="…">`, unabhaengig von der Attributreihenfolge. */
export function metaContent(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const tag = html.match(new RegExp(`<meta\\b[^>]*(?:property|name)=["']${escaped}["'][^>]*>`, 'i'))?.[0]
  const content = tag?.match(/\bcontent=["']([^"']*)["']/i)?.[1]?.trim()
  return content || null
}
