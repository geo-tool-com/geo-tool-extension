// Wird per chrome.scripting.executeScript in die Seite des Nutzers injiziert.
//
// WICHTIG: Diese Funktion wird als Quelltext serialisiert. Sie darf nichts
// referenzieren, was ausserhalb von ihr steht — keine Imports, keine
// Modul-Konstanten. Alles muss innen stehen.
//
// Sie ruft ausschliesslich same-origin-Adressen ab. Geht etwas nicht
// same-origin, wird der Befund "nicht pruefbar" — niemals ueber einen Server
// von geo-tool.com geleitet. Genau das haelt die Extension kostenlos.

export type RawEvidence = {
  finalUrl: string
  httpStatus: number | null
  responseMs: number | null
  renderedHtml: string
  /** HTML so, wie der Server es ausliefert — null, wenn nicht abrufbar. */
  rawHtml: string | null
  robotsTxt: string | null
  llmsTxtFound: boolean
  /** Erste Zeichen des Textes, den ein Crawler ohne JavaScript bekommt. */
  crawlerExcerpt: string
}

export function collectEvidence(): Promise<RawEvidence> {
  // --- alles ab hier laeuft im Tab des Nutzers ---
  const stripTags = (html: string) =>
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&[a-z#0-9]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  // Ein 200 mit HTML-Body bei /llms.txt ist ein Soft-404 der SPA-Route, kein
  // Treffer. Ohne diese Pruefung meldet jede Single-Page-App faelschlich
  // "llms.txt vorhanden".
  const looksLikePlainText = (body: string, contentType: string | null) => {
    if (contentType && /html/i.test(contentType)) return false
    return !/^\s*<(!doctype|html|head|body)/i.test(body)
  }

  const sameOriginText = async (path: string): Promise<string | null> => {
    try {
      const response = await fetch(new URL(path, location.origin).toString(), { cache: 'no-store' })
      if (!response.ok) return null
      const body = await response.text()
      return looksLikePlainText(body, response.headers.get('content-type')) ? body : null
    } catch {
      return null
    }
  }

  const run = async (): Promise<RawEvidence> => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    // Time to first byte — dieselbe Bedeutung wie "erste Antwort nach X ms"
    // im serverseitigen Check, nur ueber die echte Leitung des Nutzers.
    const responseMs =
      nav && nav.responseStart > 0 && nav.requestStart > 0
        ? Math.max(0, Math.round(nav.responseStart - nav.requestStart))
        : null

    let rawHtml: string | null = null
    let httpStatus: number | null = null
    try {
      const response = await fetch(location.href, { cache: 'force-cache', credentials: 'include' })
      httpStatus = response.status
      if (response.ok) rawHtml = await response.text()
    } catch {
      // Bleibt null: js-visibility entfaellt dann, statt geraten zu werden.
    }

    const [robotsTxt, llmsTxt] = await Promise.all([
      sameOriginText('/robots.txt'),
      sameOriginText('/llms.txt'),
    ])

    return {
      finalUrl: location.href,
      // Die Seite wird angezeigt, also war die Antwort erfolgreich. Der
      // Nachfetch liefert den genauen Code, wenn er durchgeht.
      httpStatus: httpStatus ?? 200,
      responseMs,
      renderedHtml: document.documentElement.outerHTML,
      rawHtml,
      robotsTxt,
      llmsTxtFound: llmsTxt !== null,
      crawlerExcerpt: rawHtml ? stripTags(rawHtml).slice(0, 320) : '',
    }
  }

  return run()
}
