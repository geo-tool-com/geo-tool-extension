// Baut aus Technik-Findings und Content-Readiness den AnalysisResult-Vertrag
// des Gratis-Audits — damit Startseite, PDF-Report, bezahlter Workspace UND
// die Browser-Extension dieselbe Score-Wahrheit sprechen.
//
// Bewusst ohne Netzwerk: die Findings kommen von aussen. Der Server holt sie
// ueber technical-check.ts, die Extension aus dem DOM des offenen Tabs.

import type { AnalysisResult, ScoreDetail, Suggestion } from '@/types'
import { assessContentReadiness } from './content-readiness'
import { earnedWeight, stripTags, type TechnicalFinding } from './pure'

// Kategorie-Mapping: welche Findings speisen welche Report-Kategorie.
//
// Neu kalibriert am 2026-08-10. Vorher galten 25/20/20/15/10/10 — mit drei
// messbaren Folgen:
//   1. `h1` und `js-visibility` tauchten in KEINER Kategorie auf und zaehlten
//      damit gar nicht. Ausgerechnet js-visibility ist der haerteste Befund:
//      kein grosser KI-Crawler fuehrt JavaScript aus.
//   2. platformSpecific buendelte elf Checks auf zehn Punkte — ein einzelner
//      Fehlbefund verschwand in der Rundung (fehlende llms.txt: 9,79 -> 10).
//   3. multimedia vergab zehn Punkte fuer einen einzigen Check.
// Die Summe der maxScore-Werte muss 100 ergeben (siehe Test).
const CATEGORY_FINDINGS: Record<keyof AnalysisResult['breakdown'], { ids: string[]; maxScore: number }> = {
  directAnswers: { ids: ['answer-first', 'faq-section'], maxScore: 25 },
  structure: { ids: ['h1', 'h2-structure', 'lists', 'comparison-table', 'depth'], maxScore: 20 },
  // Schema ist wichtig, aber ein CMS mit SEO-Plugin liefert JSON-LD
  // automatisch — 20 Punkte dafuer waren geschenkt.
  schemaMarkup: { ids: ['schema', 'content-schema'], maxScore: 15 },
  citations: { ids: ['evidence', 'freshness'], maxScore: 15 },
  multimedia: { ids: ['multimedia'], maxScore: 5 },
  platformSpecific: {
    ids: [
      'reachable', 'https', 'speed', 'indexable', 'ai-bots', 'llms-txt', 'canonical',
      'title', 'meta-description', 'viewport', 'content-volume', 'js-visibility',
    ],
    maxScore: 20,
  },
}


function buildScoreDetail(findings: TechnicalFinding[], ids: string[], maxScore: number): ScoreDetail {
  const picked = findings.filter((finding) => ids.includes(finding.id))
  const totalWeight = picked.reduce((sum, finding) => sum + finding.weight, 0)
  return {
    score: totalWeight ? Math.round((earnedWeight(picked) / totalWeight) * maxScore) : 0,
    maxScore,
    issues: picked.filter((finding) => finding.status !== 'pass').map((finding) => finding.detail),
    strengths: picked.filter((finding) => finding.status === 'pass').map((finding) => finding.detail),
  }
}

// "Exzellent" ab 80 hiess: eine Kanzlei-Unterseite (98), der Wikipedia-Artikel
// zum selben Thema (84) und das Bundesregierungs-Portal (88) trugen dasselbe
// Label. Ein Praedikat, das fast jede gepflegte Seite erreicht, sagt nichts.
function readinessLabel(score: number, language: 'de' | 'en'): AnalysisResult['aiReadiness'] {
  if (score >= 90) return language === 'de' ? 'Exzellent' : 'Excellent'
  if (score >= 75) return language === 'de' ? 'Gut' : 'Good'
  if (score >= 55) return language === 'de' ? 'Befriedigend' : 'Fair'
  return language === 'de' ? 'Mangelhaft' : 'Poor'
}

function suggestionFromFinding(finding: TechnicalFinding, category: string, language: 'de' | 'en'): Suggestion {
  const en = language === 'en'
  return {
    issue: finding.label,
    fix: finding.detail,
    priority: finding.status === 'fail' ? 'HIGH' : 'MEDIUM',
    estimatedImpact: finding.status === 'fail' ? (en ? 'High' : 'Hoch') : en ? 'Medium' : 'Mittel',
    category,
  }
}

// Jeder Check, der in den Score einfliesst, muss auch in einer
// Handlungsempfehlung auftauchen koennen — sonst verliert eine Seite Punkte,
// ohne je zu erfahren wofuer. `js-visibility` steht vorn: bei einer
// client-seitig gerenderten Seite ist es der Befund mit dem groessten Hebel.
const IMMEDIATE_IDS = ['answer-first', 'faq-section', 'comparison-table', 'evidence', 'indexable', 'ai-bots']
const STRUCTURAL_IDS = ['h1', 'h2-structure', 'lists', 'depth', 'multimedia', 'freshness', 'content-schema', 'schema']
const TECHNICAL_IDS = ['js-visibility', 'reachable', 'https', 'speed', 'llms-txt', 'canonical', 'title', 'meta-description', 'viewport', 'content-volume']

/**
 * Der reine Report-Aufbau. `html` dient nur noch als Quelle fuer Titel,
 * Description und Wortzahl — geholt wird hier nichts mehr.
 */
export function buildAnalysisResult(input: {
  technicalFindings: TechnicalFinding[]
  html: string
  url: string
  language: 'de' | 'en'
}): AnalysisResult {
  const readiness = assessContentReadiness(input.html, { lang: input.language })
  const findings = [...input.technicalFindings, ...readiness.findings]

  const breakdown = Object.fromEntries(
    Object.entries(CATEGORY_FINDINGS).map(([category, config]) => [
      category,
      buildScoreDetail(findings, config.ids, config.maxScore),
    ])
  ) as AnalysisResult['breakdown']

  const totalScore = Math.min(
    100,
    Object.values(breakdown).reduce((sum, detail) => sum + detail.score, 0)
  )

  const problems = findings.filter((finding) => finding.status !== 'pass')
  const pick = (ids: string[], limit: number, category: string) =>
    problems
      .filter((finding) => ids.includes(finding.id))
      .sort((a, b) => (a.status === 'fail' ? 0 : 1) - (b.status === 'fail' ? 0 : 1))
      .slice(0, limit)
      .map((finding) => suggestionFromFinding(finding, category, input.language))

  const title = input.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim()
  const description = input.html
    .match(/<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"\']*)["\']/i)?.[1]
    ?.trim()
  const wordCount = stripTags(input.html).split(/\s+/).filter(Boolean).length

  return {
    totalScore,
    aiReadiness: readinessLabel(totalScore, input.language),
    breakdown,
    suggestions: {
      immediate: pick(IMMEDIATE_IDS, 5, 'content'),
      structural: pick(STRUCTURAL_IDS, 3, 'structure'),
      technical: pick(TECHNICAL_IDS, 3, 'technical'),
    },
    // Ohne echte Kohortendaten ist eine Perzentile eine Behauptung — wir
    // spiegeln deshalb den Score (der Report zeigt primär den Score selbst).
    percentile: totalScore,
    // Das Potenzial ist hoechstens der Abstand zu 100 — ohne diese Klemme
    // meldet eine 98er-Seite noch "+10 Punkte" (= 108). Der Cap gehoert an
    // die Quelle, damit UI, Mail-Report und API-Konsumenten dieselbe Zahl sehen.
    improvementPotential: Math.min(35, Math.max(10, problems.length * 4), 100 - totalScore),
    metadata: {
      url: input.url.match(/^https?:\/\//i) ? input.url : `https://${input.url}`,
      analyzedAt: new Date().toISOString(),
      contentLength: wordCount,
      readingTime: Math.max(1, Math.round(wordCount / 200)),
      title: title || undefined,
      description: description || undefined,
    },
  }
}
