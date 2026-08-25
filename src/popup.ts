import { evaluateTechnicalFindings, type PageEvidence } from './core/evaluate'
import { buildAnalysisResult } from './core/build-analysis'
import { stripTags } from './core/pure'
import { encodeSharedCheck, SHARE_PAYLOAD_VERSION } from './core/share-payload'
import { collectEvidence, type RawEvidence } from './collect'
import { COPY, type Lang } from './i18n'

const SITE = 'https://www.geo-tool.com'
const CTA_PATH = (lang: Lang) => `${SITE}/${lang}/geo-score?utm_source=extension&utm_medium=popup`

/** Ergebnis-Link: alles steht im Fragment, erreicht den Server also nie. Damit
 *  kostet jeder geteilte Link nichts — und ist trotzdem ein echter Verweis. */
function shareUrl(vm: ViewModel): string {
  const payload = encodeSharedCheck({
    v: SHARE_PAYLOAD_VERSION,
    u: vm.raw.finalUrl,
    s: vm.analysis.totalScore,
    r: vm.analysis.aiReadiness,
    b: Object.entries(vm.analysis.breakdown).map(([key, detail]) => ({
      k: key,
      s: detail.score,
      m: detail.maxScore,
    })),
    hw: vm.directWordCount === null ? undefined : vm.renderedWords,
    mw: vm.directWordCount ?? undefined,
    x: vm.raw.crawlerExcerpt.slice(0, 200) || undefined,
    l: lang,
  })
  return `${SITE}/${lang}/ext-report#${payload}`
}

const lang: Lang = (chrome.i18n?.getUILanguage?.() ?? 'de').toLowerCase().startsWith('de') ? 'de' : 'en'
const t = COPY[lang]

const app = document.getElementById('app') as HTMLElement

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function showState(heading: string, body: string) {
  app.replaceChildren()
  const state = el('div', 'state')
  state.append(el('h2', undefined, heading), el('p', undefined, body))
  app.append(state)
}

/** Seiten, in die Chrome grundsaetzlich kein Skript laesst. */
function isRestricted(url: string | undefined): boolean {
  if (!url) return true
  return /^(chrome|edge|about|devtools|view-source|chrome-extension|moz-extension):/i.test(url) ||
    /^https:\/\/chromewebstore\.google\.com/i.test(url)
}

function toneFor(score: number): 'good' | 'mixed' | 'bad' {
  if (score >= 75) return 'good'
  if (score >= 50) return 'mixed'
  return 'bad'
}

function countWords(html: string): number {
  const text = stripTags(html)
  return text ? text.split(/\s+/).filter(Boolean).length : 0
}

async function run() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

  if (isRestricted(tab?.url)) {
    showState(t.restrictedTitle, t.restrictedBody)
    return
  }

  let raw: RawEvidence
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      func: collectEvidence,
    })
    raw = injection.result as RawEvidence
  } catch {
    showState(t.blockedTitle, t.blockedBody)
    return
  }

  const directWordCount = raw.rawHtml === null ? null : countWords(raw.rawHtml)

  const evidence: PageEvidence = {
    finalUrl: raw.finalUrl,
    httpStatus: raw.httpStatus,
    responseMs: raw.responseMs,
    blockedDirectAccess: false,
    html: raw.renderedHtml,
    directWordCount,
    renderedSource: 'browser-dom',
    robotsTxt: raw.robotsTxt,
    llmsTxtFound: raw.llmsTxtFound,
    lang,
  }

  const technical = evaluateTechnicalFindings(evidence)
  const analysis = buildAnalysisResult({
    technicalFindings: technical.findings,
    html: raw.renderedHtml,
    url: raw.finalUrl,
    language: lang,
  })

  render({ raw, analysis, renderedWords: technical.wordCount, directWordCount })
}

type ViewModel = {
  raw: RawEvidence
  analysis: ReturnType<typeof buildAnalysisResult>
  renderedWords: number
  directWordCount: number | null
}

function render(vm: ViewModel) {
  const { analysis, raw, renderedWords, directWordCount } = vm
  const score = analysis.totalScore
  const tone = toneFor(score)

  app.replaceChildren()

  // --- Kopf ---
  const bar = el('div', 'bar')
  bar.append(el('div', 'wordmark', 'GEO Check'))
  const origin = el('div', 'origin', raw.finalUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''))
  origin.title = raw.finalUrl
  bar.append(origin)
  app.append(bar)

  const scroll = el('div', 'scroll')
  app.append(scroll)

  // --- Verdikt ---
  const verdict = el('section', 'verdict')
  const row = el('div', 'verdict-row')
  const scoreEl = el('div', 'score', String(score))
  scoreEl.dataset.tone = tone
  const labelWrap = el('div')
  labelWrap.append(el('div', 'verdict-label', t.verdict[tone]))
  labelWrap.append(el('p', 'verdict-note', t.verdictNote(analysis.aiReadiness)))
  row.append(scoreEl, labelWrap)
  verdict.append(row)

  const meter = el('div', 'meter')
  meter.style.color = tone === 'good' ? 'var(--lime)' : tone === 'mixed' ? 'var(--warn)' : 'var(--fail)'
  const fill = el('span')
  fill.style.width = '0%'
  meter.append(fill)
  verdict.append(meter)
  scroll.append(verdict)
  requestAnimationFrame(() => {
    fill.style.width = `${score}%`
  })

  // --- Crawler-Blick: das Herzstueck ---
  const crawler = el('section', 'crawler')
  const head = el('div', 'crawler-head')
  head.append(el('h2', undefined, t.crawlerHeading))

  if (directWordCount !== null) {
    const gap = el('div', 'gap')
    gap.append(
      document.createTextNode(`${t.human} `),
      Object.assign(el('b'), { textContent: renderedWords.toLocaleString(lang) }),
      document.createTextNode(`  ·  ${t.machine} `),
      Object.assign(el('b'), { textContent: directWordCount.toLocaleString(lang) })
    )
    if (directWordCount < Math.max(50, renderedWords * 0.3)) gap.dataset.tone = 'bad'
    head.append(gap)
  }
  crawler.append(head)

  const readout = el('div', 'readout')
  if (raw.rawHtml === null) {
    readout.classList.add('is-empty')
    readout.textContent = t.readoutUnavailable
  } else if (!raw.crawlerExcerpt.trim()) {
    readout.classList.add('is-empty')
    readout.textContent = t.readoutEmpty
  } else {
    readout.textContent = raw.crawlerExcerpt
    readout.append(el('i', 'caret'))
  }
  crawler.append(readout)
  scroll.append(crawler)

  // --- Kategorien ---
  const categories = el('section', 'categories')
  for (const [key, detail] of Object.entries(analysis.breakdown)) {
    const rowEl = el('div', 'cat')
    rowEl.append(el('div', 'cat-name', t.categories[key as keyof typeof t.categories] ?? key))
    rowEl.append(el('div', 'cat-num', `${detail.score}/${detail.maxScore}`))
    const barEl = el('div', 'cat-bar')
    const barFill = el('span')
    barFill.style.width = '0%'
    barFill.dataset.full = String(detail.score >= detail.maxScore)
    barEl.append(barFill)
    rowEl.append(barEl)
    categories.append(rowEl)
    requestAnimationFrame(() => {
      barFill.style.width = `${Math.round((detail.score / detail.maxScore) * 100)}%`
    })
  }
  scroll.append(categories)

  // --- Befunde: was nicht passt, zuerst ---
  const findingsBox = el('section', 'findings')
  findingsBox.append(el('h2', undefined, t.findingsHeading))

  const suggestions = [
    ...analysis.suggestions.immediate,
    ...analysis.suggestions.technical,
    ...analysis.suggestions.structural,
  ]
  const shown = suggestions.slice(0, 5)

  if (shown.length === 0) {
    findingsBox.append(el('p', 'finding-detail', t.noFindings))
  }
  for (const suggestion of shown) {
    const item = el('div', 'finding')
    const mark = el('div', 'mark', suggestion.priority === 'HIGH' ? '✕' : '!')
    mark.dataset.status = suggestion.priority === 'HIGH' ? 'fail' : 'warn'
    const body = el('div')
    body.append(el('div', 'finding-label', suggestion.issue))
    body.append(el('p', 'finding-detail', suggestion.fix))
    item.append(mark, body)
    findingsBox.append(item)
  }

  if (suggestions.length > shown.length) {
    findingsBox.append(el('p', 'passes', t.more(suggestions.length - shown.length)))
  }
  scroll.append(findingsBox)

  // --- Aktionen ---
  const actions = el('div', 'actions')
  const copy = el('button', 'btn', t.copy) as HTMLButtonElement
  copy.type = 'button'
  copy.addEventListener('click', async () => {
    await navigator.clipboard.writeText(asMarkdown(vm))
    copy.textContent = t.copied
    setTimeout(() => {
      copy.textContent = t.copy
    }, 1600)
  })

  const cta = el('a', 'btn btn-primary', t.cta) as HTMLAnchorElement
  cta.href = CTA_PATH(lang)
  cta.target = '_blank'
  cta.rel = 'noopener noreferrer'

  actions.append(copy, cta)
  app.append(actions)
}

/** Teilbares Ergebnis — der Link darin ist die einzige Verbreitung, die die
 *  Extension erzeugt, und sie kostet nichts. */
function asMarkdown(vm: ViewModel): string {
  const { analysis, raw, renderedWords, directWordCount } = vm
  const lines = [
    `**[GEO Check: ${analysis.totalScore}/100](${shareUrl(vm)})** — ${analysis.aiReadiness}`,
    `${raw.finalUrl}`,
    '',
    ...Object.entries(analysis.breakdown).map(
      ([key, detail]) =>
        `- ${t.categories[key as keyof typeof t.categories] ?? key}: ${detail.score}/${detail.maxScore}`
    ),
  ]
  if (directWordCount !== null) {
    lines.push('', `${t.human} ${renderedWords} · ${t.machine} ${directWordCount}`)
  }
  lines.push('', `${t.markdownFooter} ${shareUrl(vm)}`)
  return lines.join('\n')
}

run().catch(() => showState(t.errorTitle, t.errorBody))
