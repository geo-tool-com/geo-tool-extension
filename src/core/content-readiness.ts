// Content-Readiness: bewertet, ob der INHALT einer Live-Seite KI-antwortfähig
// ist — portiert und verbessert aus dem Startseiten-Audit (simple-analyzer),
// damit Workspace und Gratis-Check dieselbe Score-Wahrheit sprechen.
//
// Bewusste Abweichungen vom Original:
// - H1-Zählung bleibt exklusiv im Technik-Check (kein Doppelzählen desselben Signals).
// - „Belege" heißt jetzt: externe Quellen-Links + konkrete Zahlen, nicht nur
//   blockquote-Tags (die fast niemand nutzt).
// - NEU: Vergleichstabellen (für Kauf-/Vergleichsfragen das stärkste
//   Extraktionsformat) und Aktualitätssignal (dateModified/time-Tag).
// - Die alte „Platform Optimization"-Kategorie (Keyword-Fuzzy-Matching) wurde
//   verworfen — zu wenig Aussagekraft pro Punkt.

import {
  earnedWeight,
  extractSchema,
  schemaNodeTypes,
  stripTags,
  type SchemaNode,
  type TechnicalCheckLang,
  type TechnicalFinding,
} from './pure'

export type ContentReadinessResult = {
  score: number
  findings: TechnicalFinding[]
}

export type ContentReadinessOptions = {
  lang?: TechnicalCheckLang
  /** Adresse der Seite — nur fuer Befunde, die allein auf der Startseite gelten. */
  url?: string
  /**
   * `fragment` = eingefuegter Text oder Entwurf ohne Seitenrahmen. Befunde, die
   * eine ganze Seite voraussetzen (Entity, Impressum, main-Element), entfallen —
   * einem Absatz fehlt kein Impressum.
   */
  scope?: 'page' | 'fragment'
}

const ANSWER_OPENERS = /^(ja|nein|kurz gesagt|die antwort|es gibt|yes|no|in short|the answer|there (is|are))/i

// Der Definitionssatz ("X ist/sind …") ist das meistzitierte Antwortformat in
// KI-Ergebnissen — und wurde von der reinen Wortzahl-Schwelle bestraft: Der
// Wikipedia-Artikel zur StPO oeffnet mit einer lehrbuchreifen Definition in
// 24 Woertern und galt damit als "zu duenn fuer eine direkte Antwort".
const DEFINITION_OPENER =
  /^(der|die|das|ein|eine)?\s*[\wÄÖÜäöüß()-]+(\s+[\wÄÖÜäöüß()-]+){0,4}\s+(ist|sind|bezeichnet|bedeutet|beschreibt|regelt|is|are|means|refers to|describes)\s/i

// Navigation, Kopf- und Fusszeile sind keine Antwort. Ohne diesen Schnitt hat
// der Check auf einer realen Kanzlei-Seite ein 274 Woerter langes
// Menue-Konstrukt als "direkte Antwort im ersten Absatz" gewertet — und dafuer
// das hoechste Einzelgewicht der Content-Analyse vergeben.
function stripChrome(html: string): string {
  return html.replace(/<(nav|header|footer|aside)[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
}

function firstParagraphText(html: string): string {
  const paragraphs = stripChrome(html).match(/<p[^>]*>([\s\S]*?)<\/p>/gi) ?? []
  for (const paragraph of paragraphs) {
    const text = stripTags(paragraph)
    if (text.split(/\s+/).length >= 15) return text
  }
  return ''
}

const QUESTION_OPENER =
  /^(wie|was|warum|weshalb|wieso|wann|wo|woher|wohin|wer|wen|wem|welche[rsnm]?|wieviel|wozu|womit|woran|kann|können|darf|muss|soll|ist|sind|gibt|lohnt|braucht|how|what|why|when|where|who|which|can|could|should|does|do|is|are|will)\b/i

// schema.org kennt hunderte Untertypen von LocalBusiness (Dentist, Attorney,
// Restaurant …). Wer sameAs traegt, weist sich als Entity aus, egal wie der
// Typ heisst; ohne sameAs entscheidet der Name des Typs.
const ENTITY_TYPE =
  /organization|corporation|business|person|\bngo\b|service|store|shop|clinic|practice|agency|company|hotel|restaurant|dentist|attorney|physician|notary|contractor|dealer|repair/i
// Typen mit sameAs, die trotzdem kein Absender sind.
const NON_ENTITY_TYPE = /^(webpage|website|article|blogposting|newsarticle|product|imageobject|videoobject|breadcrumblist|faqpage|howto)$/i

function isEntityNode(node: SchemaNode): boolean {
  if (hasType(node, NON_ENTITY_TYPE)) return false
  return hasType(node, ENTITY_TYPE) || asList(node.sameAs).length > 0
}
const ARTICLE_TYPE = /^(article|blogposting|newsarticle|techarticle|scholarlyarticle|report)$/i

function hasType(node: SchemaNode, pattern: RegExp): boolean {
  return schemaNodeTypes(node).some((type) => pattern.test(type))
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value == null ? [] : [value]
}

function isHomepage(url: string | undefined): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url.match(/^https?:\/\//i) ? url : `https://${url}`)
    // Sprach-Startseiten (/de, /en-us/) zaehlen mit.
    return /^\/([a-z]{2}(-[a-z]{2})?\/?)?$/i.test(parsed.pathname)
  } catch {
    return false
  }
}

// Seiten, die sagen, wer hinter dem Inhalt steht. Geprueft wird Linkziel und
// Linktext, weil "/unternehmen/ueber-uns" und "<a>Impressum</a>" beides zaehlt.
const TRUST_LINKS: Array<{ kind: string; pattern: RegExp }> = [
  { kind: 'Impressum', pattern: /impressum|imprint|legal-notice|legal notice/i },
  { kind: 'Kontakt', pattern: /kontakt|contact/i },
  { kind: 'Über uns', pattern: /ueber-uns|über uns|uber-uns|about|unternehmen|company|team/i },
  { kind: 'Datenschutz', pattern: /datenschutz|privacy/i },
]

function countMatches(html: string, pattern: RegExp): number {
  return (html.match(pattern) ?? []).length
}

export function assessContentReadiness(html: string, options: ContentReadinessOptions = {}): ContentReadinessResult {
  const en = options.lang === 'en'
  const wholePage = options.scope !== 'fragment'
  // Ueberschriften aus Navigation und Fusszeile gehoeren nicht zur Gliederung
  // des Inhalts — Footer-Spalten mit H4 saehen sonst wie ein Ebenensprung aus.
  const body = stripChrome(html)
  const findings: TechnicalFinding[] = []
  const add = (id: string, label: string, status: TechnicalFinding['status'], detail: string, weight: number) =>
    findings.push({ id, label, status, detail, weight })

  const text = stripTags(html)
  const wordCount = text ? text.split(/\s+/).length : 0

  // 1. Answer-first: beantwortet der erste substanzielle Absatz direkt?
  const lead = firstParagraphText(html)
  const leadWords = lead ? lead.split(/\s+/).length : 0
  // Eine Antwort ist entweder ausreichend ausgefuehrt ODER erkennbar als
  // Antwort/Definition formuliert — die Wortzahl allein sagt darueber nichts.
  const leadAnswers =
    leadWords >= 25 || ANSWER_OPENERS.test(lead) || (leadWords >= 12 && DEFINITION_OPENER.test(lead))
  add(
    'answer-first',
    en ? 'Answer in the first paragraph' : 'Antwort im ersten Absatz',
    lead && leadAnswers ? 'pass' : lead ? 'warn' : 'fail',
    lead
      ? leadAnswers
        ? en
          ? `The first paragraph (${leadWords} words) delivers a direct answer.`
          : `Der erste Absatz (${leadWords} Wörter) liefert eine direkte Antwort.`
        : en
          ? `At ${leadWords} words, the first paragraph is too thin for a direct answer - AI answers cite the first hit.`
          : `Der erste Absatz ist mit ${leadWords} Wörtern zu dünn für eine direkte Antwort - KI-Antworten zitieren den ersten Treffer.`
      : en
        ? 'No substantial text paragraph found - the page answers nothing directly.'
        : 'Kein substanzieller Textabsatz gefunden - die Seite beantwortet nichts direkt.',
    18
  )

  // 2. Struktur: H2-Gliederung und Listen (H1 prüft der Technik-Check).
  const h2Count = countMatches(html, /<h2[\s>]/gi)
  add(
    'h2-structure',
    en ? 'H2 structure' : 'H2-Gliederung',
    h2Count >= 2 && h2Count <= 12 ? 'pass' : h2Count > 0 ? 'warn' : 'fail',
    h2Count
      ? en
        ? `${h2Count} H2 headings${h2Count > 12 ? ' - a lot; each section should solve one question' : ''}.`
        : `${h2Count} H2-Überschriften${h2Count > 12 ? ' - sehr viele; jede Section sollte eine Frage lösen' : ''}.`
      : en
        ? 'No H2 headings - without structure, AI answers cannot extract sections.'
        : 'Keine H2-Überschriften - ohne Gliederung können KI-Antworten keine Abschnitte extrahieren.',
    12
  )

  const hasLists = /<(ul|ol)[\s>]/i.test(html)
  add(
    'lists',
    en ? 'Lists' : 'Listen',
    hasLists ? 'pass' : 'warn',
    hasLists
      ? en
        ? 'Lists present - easy to extract.'
        : 'Listen vorhanden - gut extrahierbar.'
      : en
        ? 'No lists - bullet points are the most-cited format in AI answers.'
        : 'Keine Listen - Aufzählungen sind das meistzitierte Format in KI-Antworten.',
    8
  )

  // NEU: Vergleichstabellen — für Kauf-/Vergleichsfragen das stärkste Format.
  const hasTable = /<table[\s>]/i.test(html)
  add(
    'comparison-table',
    en ? 'Table' : 'Tabelle',
    hasTable ? 'pass' : 'warn',
    hasTable
      ? en
        ? 'Table present - comparison data is directly extractable.'
        : 'Tabelle vorhanden - Vergleichsdaten sind direkt extrahierbar.'
      : en
        ? 'No table - for comparison and pricing questions, AI answers prefer citing tables.'
        : 'Keine Tabelle - bei Vergleichs- und Preisfragen zitieren KI-Antworten bevorzugt Tabellen.',
    8
  )

  // Ueberschriften als Frage: so fragen Menschen die KI, und so wird zugeordnet.
  const subHeadings = (body.match(/<h[2-4][^>]*>[\s\S]*?<\/h[2-4]\s*>/gi) ?? []).map((heading) => stripTags(heading))
  const questionHeadings = subHeadings.filter((heading) => /\?\s*$/.test(heading) || QUESTION_OPENER.test(heading)).length
  add(
    'question-headings',
    en ? 'Headings phrased as questions' : 'Überschriften als Frage',
    questionHeadings >= 2 ? 'pass' : 'warn',
    questionHeadings
      ? en
        ? `${questionHeadings} of ${subHeadings.length} H2-H4 headings are phrased as a question${questionHeadings < 2 ? ' - a few more make sections easier to match to real questions' : ''}.`
        : `${questionHeadings} von ${subHeadings.length} H2-H4-Überschriften sind als Frage formuliert${questionHeadings < 2 ? ' - ein paar mehr machen Abschnitte echten Fragen leichter zuordenbar' : ''}.`
      : en
        ? 'No H2-H4 heading is phrased as a question - phrase some the way readers ask.'
        : 'Keine H2-H4-Überschrift ist als Frage formuliert - formuliere einige so, wie Leser fragen.',
    6
  )

  // Uebersprungene Ebenen (H2 -> H4) zerreissen die Gliederung, aus der
  // Abschnitte extrahiert werden.
  const levels = Array.from(body.matchAll(/<h([1-6])[\s>]/gi), (match) => Number(match[1]))
  const skips = levels.filter((level, index) => index > 0 && level - (levels[index - 1] ?? level) > 1).length
  if (levels.length >= 2) {
    add(
      'heading-order',
      en ? 'Heading levels in order' : 'Überschriften-Ebenen in Reihenfolge',
      skips === 0 ? 'pass' : 'warn',
      skips === 0
        ? en
          ? 'Heading levels do not skip.'
          : 'Die Überschriften-Ebenen überspringen keine Stufe.'
        : en
          ? `${skips} place${skips > 1 ? 's' : ''} where a heading level is skipped (e.g. H2 to H4) - the outline of the page breaks there.`
          : `${skips} Stelle${skips > 1 ? 'n' : ''}, an denen eine Ebene übersprungen wird (z. B. H2 auf H4) - dort reißt die Gliederung der Seite.`,
      4
    )
  }

  const hasMainLandmark = /<(main|article)[\s>]/i.test(html) || /role=["']main["']/i.test(html)
  if (wholePage) add(
    'landmarks',
    en ? 'Main content marked up' : 'Hauptinhalt ausgezeichnet',
    hasMainLandmark ? 'pass' : 'warn',
    hasMainLandmark
      ? en
        ? 'main or article element present - the content is separable from navigation and footer.'
        : 'main- oder article-Element vorhanden - der Inhalt ist von Navigation und Fußzeile trennbar.'
      : en
        ? 'No main or article element - machines cannot tell content from navigation and footer.'
        : 'Kein main- oder article-Element - Maschinen können Inhalt nicht von Navigation und Fußzeile trennen.',
    4
  )

  // 3. FAQ-Bereich.
  const hasFaqHeading = /<h[2-4][^>]*>[^<]*(faq|häufig|haeufig|fragen|questions)/i.test(html)
  add(
    'faq-section',
    en ? 'FAQ section' : 'FAQ-Bereich',
    hasFaqHeading ? 'pass' : 'warn',
    hasFaqHeading
      ? en
        ? 'FAQ section found - covers follow-up questions.'
        : 'FAQ-Bereich gefunden - deckt Folgefragen ab.'
      : en
        ? 'No FAQ section - follow-up questions are the easiest way into additional AI answers.'
        : 'Kein FAQ-Bereich - Folgefragen sind der einfachste Weg in zusätzliche KI-Antworten.',
    10
  )

  // 4. Schema-Tiefe: content-relevante Typen (Existenz von JSON-LD prüft Technik).
  const schema = extractSchema(html)
  const schemaTypes = Array.from(new Set(schema.nodes.flatMap(schemaNodeTypes)))
  const contentSchema = schemaTypes.filter((type) => /faqpage|howto|article|product|review|breadcrumb/i.test(type))
  add(
    'content-schema',
    'Content-Schema',
    contentSchema.length ? 'pass' : schemaTypes.length ? 'warn' : 'fail',
    contentSchema.length
      ? en
        ? `Content types: ${contentSchema.slice(0, 4).join(', ')}.`
        : `Content-Typen: ${contentSchema.slice(0, 4).join(', ')}.`
      : schemaTypes.length
        ? en
          ? `JSON-LD present (${schemaTypes.slice(0, 3).join(', ')}), but without content types like FAQPage/Article/HowTo.`
          : `JSON-LD vorhanden (${schemaTypes.slice(0, 3).join(', ')}), aber ohne Content-Typen wie FAQPage/Article/HowTo.`
        : en
          ? 'No content schema - FAQPage/Article/HowTo make answers machine-readable.'
          : 'Kein Content-Schema - FAQPage/Article/HowTo machen Antworten maschinenlesbar.',
    12
  )

  if (wholePage && schema.blocks > 0) {
    add(
      'schema-valid',
      en ? 'JSON-LD parses' : 'JSON-LD lesbar',
      schema.invalidBlocks ? 'fail' : 'pass',
      schema.invalidBlocks
        ? en
          ? `${schema.invalidBlocks} of ${schema.blocks} JSON-LD blocks contain invalid JSON - machines discard them entirely.`
          : `${schema.invalidBlocks} von ${schema.blocks} JSON-LD-Blöcken enthalten ungültiges JSON - Maschinen verwerfen sie komplett.`
        : en
          ? `${schema.blocks} JSON-LD block${schema.blocks > 1 ? 's' : ''}, all valid JSON.`
          : `${schema.blocks} JSON-LD-${schema.blocks > 1 ? 'Blöcke' : 'Block'}, durchweg gültiges JSON.`,
      3
    )
  }

  // Wer steht hinter der Seite? Organization/Person mit sameAs verknuepft die
  // Seite mit den Profilen, ueber die KI-Systeme eine Marke wiedererkennen.
  const entityNodes = schema.nodes.filter(isEntityNode)
  const entity =
    entityNodes.find((node) => asList(node.sameAs).length > 0) ?? entityNodes.find((node) => typeof node.name === 'string') ?? entityNodes[0]
  const sameAs = entity ? asList(entity.sameAs).filter((link) => typeof link === 'string') : []
  const entityName = entity && typeof entity.name === 'string' ? entity.name : null
  if (wholePage) add(
    'entity',
    en ? 'Organization or person declared' : 'Unternehmen oder Person ausgewiesen',
    entity && entityName && sameAs.length >= 2 ? 'pass' : entity ? 'warn' : 'fail',
    entity
      ? en
        ? `${schemaNodeTypes(entity)[0]}${entityName ? ` "${entityName.slice(0, 60)}"` : ' without a name'} with ${sameAs.length} sameAs link${sameAs.length === 1 ? '' : 's'}${sameAs.length < 2 ? ' - link the official profiles (LinkedIn, Wikipedia, Wikidata) so AI systems recognise the brand' : ''}.`
        : `${schemaNodeTypes(entity)[0]}${entityName ? ` "${entityName.slice(0, 60)}"` : ' ohne Namen'} mit ${sameAs.length} sameAs-Link${sameAs.length === 1 ? '' : 's'}${sameAs.length < 2 ? ' - verlinke die offiziellen Profile (LinkedIn, Wikipedia, Wikidata), damit KI-Systeme die Marke wiedererkennen' : ''}.`
      : en
        ? 'No Organization or Person in the structured data - the page does not tell machines who is behind it.'
        : 'Keine Organization oder Person in den strukturierten Daten - die Seite sagt Maschinen nicht, wer dahintersteht.',
    8
  )

  if (wholePage && isHomepage(options.url)) {
    const hasWebSite = schema.nodes.some((node) => hasType(node, /^website$/i))
    add(
      'website-node',
      en ? 'WebSite node on the homepage' : 'WebSite-Angabe auf der Startseite',
      hasWebSite ? 'pass' : 'warn',
      hasWebSite
        ? en
          ? 'WebSite node present - the site name is declared.'
          : 'WebSite-Angabe vorhanden - der Name der Website ist ausgewiesen.'
        : en
          ? 'No WebSite node on the homepage - add one with name and url so the site name is declared.'
          : 'Keine WebSite-Angabe auf der Startseite - ergänze eine mit name und url, damit der Name der Website ausgewiesen ist.',
      3
    )
  }

  // Autor nur dort pruefen, wo ein Artikel ausgezeichnet ist — eine
  // Produktseite ohne Autor ist kein Mangel.
  const articleNode = schema.nodes.find((node) => hasType(node, ARTICLE_TYPE))
  if (wholePage && articleNode) {
    const authors = asList(articleNode.author)
    const personAuthor = authors.find(
      (author): author is SchemaNode =>
        Boolean(author) && typeof author === 'object' && hasType(author as SchemaNode, /^person$/i) && typeof (author as SchemaNode).name === 'string'
    )
    add(
      'author',
      en ? 'Author as a person' : 'Autor als Person',
      personAuthor ? 'pass' : authors.length ? 'warn' : 'fail',
      personAuthor
        ? en
          ? `The article names "${String(personAuthor.name).slice(0, 60)}" as its author.`
          : `Der Artikel nennt "${String(personAuthor.name).slice(0, 60)}" als Autor.`
        : authors.length
          ? en
            ? 'The article has an author, but not as a Person with a name - AI systems weigh who wrote something.'
            : 'Der Artikel hat einen Autor, aber nicht als Person mit Namen - KI-Systeme gewichten, wer etwas geschrieben hat.'
          : en
            ? 'The article schema names no author - anonymous content is cited less.'
            : 'Das Artikel-Schema nennt keinen Autor - anonyme Inhalte werden seltener zitiert.',
      6
    )
  }

  const anchors = html.match(/<a\b[^>]*>[\s\S]{0,200}?<\/a\s*>/gi) ?? []
  const trustKinds = TRUST_LINKS.filter(({ pattern }) => anchors.some((anchor) => pattern.test(anchor))).map(({ kind }) => kind)
  if (wholePage) add(
    'trust-links',
    en ? 'Who is behind the page' : 'Wer hinter der Seite steht',
    trustKinds.length >= 2 ? 'pass' : trustKinds.length ? 'warn' : 'fail',
    trustKinds.length
      ? en
        ? `Linked: ${trustKinds.join(', ')}${trustKinds.length < 2 ? ' - legal notice, contact and about pages show who is accountable for the content' : ''}.`
        : `Verlinkt: ${trustKinds.join(', ')}${trustKinds.length < 2 ? ' - Impressum, Kontakt und Über-uns-Seite zeigen, wer für den Inhalt einsteht' : ''}.`
      : en
        ? 'No link to a legal notice, contact, about or privacy page - nothing shows who is accountable for the content.'
        : 'Kein Link zu Impressum, Kontakt, Über uns oder Datenschutz - nichts zeigt, wer für den Inhalt einsteht.',
    5
  )

  // 5. Belege: externe Quellen-Links + konkrete Zahlen.
  const externalLinks = countMatches(html, /<a[^>]*href=["']https?:\/\//gi)
  const numbers = countMatches(text, /\b\d+([.,]\d+)?\s*(%|€|\$|prozent|percent)\b/gi)
  const evidenceOk = externalLinks >= 2 || numbers >= 3
  add(
    'evidence',
    en ? 'Evidence & data' : 'Belege & Daten',
    evidenceOk ? 'pass' : externalLinks + numbers > 0 ? 'warn' : 'fail',
    en
      ? `${externalLinks} external links, ${numbers} concrete numbers/prices${evidenceOk ? ' - claims are backed up.' : ' - AI answers prefer pages with verifiable data.'}`
      : `${externalLinks} externe Links, ${numbers} konkrete Zahlen/Preise${evidenceOk ? ' - Aussagen sind belegt.' : ' - KI-Antworten bevorzugen Seiten mit überprüfbaren Daten.'}`,
    12
  )

  // 6. Multimedia mit Alt-Texten.
  const images = countMatches(html, /<img[\s>]/gi)
  const imagesWithAlt = countMatches(html, /<img[^>]*alt=["'][^"']+["']/gi)
  add(
    'multimedia',
    en ? 'Images with alt text' : 'Bilder mit Alt-Text',
    images > 0 && imagesWithAlt >= Math.ceil(images / 2) ? 'pass' : images > 0 ? 'warn' : 'warn',
    images
      ? en
        ? `${imagesWithAlt}/${images} images with alt text.`
        : `${imagesWithAlt}/${images} Bilder mit Alt-Text.`
      : en
        ? 'No images - visual anchors improve dwell time and comprehension.'
        : 'Keine Bilder - visuelle Anker verbessern Verweildauer und Verständnis.',
    6
  )

  // NEU: Aktualität — KI-Suchen bevorzugen datierte, frische Inhalte.
  const hasFreshness = /datemodified|datepublished/i.test(html) || /<time[\s>]/i.test(html)
  add(
    'freshness',
    en ? 'Freshness signal' : 'Aktualitätssignal',
    hasFreshness ? 'pass' : 'warn',
    hasFreshness
      ? en
        ? 'dateModified/datePublished or time tag present.'
        : 'dateModified/datePublished oder time-Tag vorhanden.'
      : en
        ? 'No date signal - without dateModified the page looks ageless to AI search.'
        : 'Kein Datumssignal - ohne dateModified wirkt die Seite für KI-Suchen alterslos.',
    6
  )

  // 7. Textvolumen mit Substanz (schärfer als der reine Technik-Mindestwert).
  add(
    'depth',
    en ? 'Content depth' : 'Inhaltstiefe',
    wordCount >= 600 ? 'pass' : wordCount >= 250 ? 'warn' : 'fail',
    en ? `${wordCount} words of body text.` : `${wordCount} Wörter Fließtext.`,
    8
  )

  const totalWeight = findings.reduce((sum, finding) => sum + finding.weight, 0)

  return {
    score: totalWeight ? Math.round((earnedWeight(findings) / totalWeight) * 100) : 0,
    findings,
  }
}
