// Vertrag zwischen Extension und Website fuer geteilte Ergebnisse.
//
// Das Ergebnis steht im URL-FRAGMENT, nicht im Pfad. Ein Fragment schickt der
// Browser nie an den Server: Teilen kostet damit keinen Function-Call, keinen
// Speicher und keine Datenbank — anders als die bestehende /share/[id]-Route
// ueber Vercel Blob. Nebeneffekt: Google sieht genau EINE URL statt beliebig
// vieler Varianten, also entsteht auch kein Index-Ballast.
//
// Isomorph: laeuft in der Extension und im Browser des Lesers.

export const SHARE_PAYLOAD_VERSION = 1

export type SharedCategory = {
  /** Schluessel aus AnalysisResult['breakdown'], z. B. "schemaMarkup". */
  k: string
  s: number
  m: number
}

export type SharedCheck = {
  v: number
  /** Geprüfte URL. Beim Rendern gegen http/https pruefen. */
  u: string
  /** Gesamtscore 0–100. */
  s: number
  /** Label, z. B. "Exzellent". */
  r: string
  b: SharedCategory[]
  /** Woerter im gerenderten DOM. */
  hw?: number
  /** Woerter im ausgelieferten HTML. */
  mw?: number
  /** Erste Zeichen dessen, was ein Crawler bekommt. */
  x?: string
  l: 'de' | 'en'
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

export function encodeSharedCheck(payload: SharedCheck): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(payload)))
}

/**
 * Liest ein geteiltes Ergebnis. Alles hier kommt aus einer fremden URL —
 * jedes Feld wird geprueft, nichts wird uebernommen, weil es "da steht".
 */
export function decodeSharedCheck(encoded: string): SharedCheck | null {
  if (!encoded || encoded.length > 8000) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(encoded)))
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null

  const raw = parsed as Record<string, unknown>
  if (raw.v !== SHARE_PAYLOAD_VERSION) return null
  if (typeof raw.u !== 'string' || !/^https?:\/\//i.test(raw.u)) return null
  if (typeof raw.s !== 'number' || !Number.isFinite(raw.s)) return null

  const categories = Array.isArray(raw.b) ? raw.b : []
  const b: SharedCategory[] = []
  for (const entry of categories.slice(0, 12)) {
    if (!entry || typeof entry !== 'object') continue
    const item = entry as Record<string, unknown>
    if (typeof item.k !== 'string' || typeof item.s !== 'number' || typeof item.m !== 'number') continue
    if (!Number.isFinite(item.s) || !Number.isFinite(item.m) || item.m <= 0) continue
    b.push({ k: item.k.slice(0, 40), s: clamp(item.s, 0, item.m), m: clamp(item.m, 1, 100) })
  }

  return {
    v: SHARE_PAYLOAD_VERSION,
    u: raw.u.slice(0, 300),
    s: clamp(raw.s, 0, 100),
    r: typeof raw.r === 'string' ? raw.r.slice(0, 40) : '',
    b,
    hw: typeof raw.hw === 'number' && Number.isFinite(raw.hw) ? clamp(raw.hw, 0, 10_000_000) : undefined,
    mw: typeof raw.mw === 'number' && Number.isFinite(raw.mw) ? clamp(raw.mw, 0, 10_000_000) : undefined,
    x: typeof raw.x === 'string' ? raw.x.slice(0, 320) : undefined,
    l: raw.l === 'en' ? 'en' : 'de',
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}
