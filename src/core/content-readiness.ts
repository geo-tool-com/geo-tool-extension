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

import { earnedWeight, extractSchemaTypes, stripTags, type TechnicalCheckLang, type TechnicalFinding } from './pure'

export type ContentReadinessResult = {
  score: number
  findings: TechnicalFinding[]
}

export type ContentReadinessOptions = {
  lang?: TechnicalCheckLang
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

function countMatches(html: string, pattern: RegExp): number {
  return (html.match(pattern) ?? []).length
}

export function assessContentReadiness(html: string, options: ContentReadinessOptions = {}): ContentReadinessResult {
  const en = options.lang === 'en'
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
          ? `At ${leadWords} words, the first paragraph is too thin for a direct answer — AI answers cite the first hit.`
          : `Der erste Absatz ist mit ${leadWords} Wörtern zu dünn für eine direkte Antwort — KI-Antworten zitieren den ersten Treffer.`
      : en
        ? 'No substantial text paragraph found — the page answers nothing directly.'
        : 'Kein substanzieller Textabsatz gefunden — die Seite beantwortet nichts direkt.',
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
        ? `${h2Count} H2 headings${h2Count > 12 ? ' — a lot; each section should solve one question' : ''}.`
        : `${h2Count} H2-Überschriften${h2Count > 12 ? ' — sehr viele; jede Section sollte eine Frage lösen' : ''}.`
      : en
        ? 'No H2 headings — without structure, AI answers cannot extract sections.'
        : 'Keine H2-Überschriften — ohne Gliederung können KI-Antworten keine Abschnitte extrahieren.',
    12
  )

  const hasLists = /<(ul|ol)[\s>]/i.test(html)
  add(
    'lists',
    en ? 'Lists' : 'Listen',
    hasLists ? 'pass' : 'warn',
    hasLists
      ? en
        ? 'Lists present — easy to extract.'
        : 'Listen vorhanden — gut extrahierbar.'
      : en
        ? 'No lists — bullet points are the most-cited format in AI answers.'
        : 'Keine Listen — Aufzählungen sind das meistzitierte Format in KI-Antworten.',
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
        ? 'Table present — comparison data is directly extractable.'
        : 'Tabelle vorhanden — Vergleichsdaten sind direkt extrahierbar.'
      : en
        ? 'No table — for comparison and pricing questions, AI answers prefer citing tables.'
        : 'Keine Tabelle — bei Vergleichs- und Preisfragen zitieren KI-Antworten bevorzugt Tabellen.',
    8
  )

  // 3. FAQ-Bereich.
  const hasFaqHeading = /<h[2-4][^>]*>[^<]*(faq|häufig|haeufig|fragen|questions)/i.test(html)
  add(
    'faq-section',
    en ? 'FAQ section' : 'FAQ-Bereich',
    hasFaqHeading ? 'pass' : 'warn',
    hasFaqHeading
      ? en
        ? 'FAQ section found — covers follow-up questions.'
        : 'FAQ-Bereich gefunden — deckt Folgefragen ab.'
      : en
        ? 'No FAQ section — follow-up questions are the easiest way into additional AI answers.'
        : 'Kein FAQ-Bereich — Folgefragen sind der einfachste Weg in zusätzliche KI-Antworten.',
    10
  )

  // 4. Schema-Tiefe: content-relevante Typen (Existenz von JSON-LD prüft Technik).
  const schemaTypes = extractSchemaTypes(html)
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
          ? 'No content schema — FAQPage/Article/HowTo make answers machine-readable.'
          : 'Kein Content-Schema — FAQPage/Article/HowTo machen Antworten maschinenlesbar.',
    12
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
      ? `${externalLinks} external links, ${numbers} concrete numbers/prices${evidenceOk ? ' — claims are backed up.' : ' — AI answers prefer pages with verifiable data.'}`
      : `${externalLinks} externe Links, ${numbers} konkrete Zahlen/Preise${evidenceOk ? ' — Aussagen sind belegt.' : ' — KI-Antworten bevorzugen Seiten mit überprüfbaren Daten.'}`,
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
        ? 'No images — visual anchors improve dwell time and comprehension.'
        : 'Keine Bilder — visuelle Anker verbessern Verweildauer und Verständnis.',
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
        ? 'No date signal — without dateModified the page looks ageless to AI search.'
        : 'Kein Datumssignal — ohne dateModified wirkt die Seite für KI-Suchen alterslos.',
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
