// Type shim for the vendored scoring core. In the geo-tool.com monorepo the
// core imports these from '@/types'; this repository maps that alias here
// (see tsconfig "paths") so the vendored files stay byte-identical to their
// monorepo source. Keep in sync with geo-tool-nextjs/src/types/index.ts.

export interface ScoreDetail {
  score: number
  maxScore: number
  issues: string[]
  strengths: string[]
}

export interface Suggestion {
  issue: string
  fix: string
  example?: string
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
  estimatedImpact: string
  category: string
}

export interface AnalysisResult {
  totalScore: number
  aiReadiness: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Exzellent' | 'Gut' | 'Befriedigend' | 'Mangelhaft'
  breakdown: {
    directAnswers: ScoreDetail
    structure: ScoreDetail
    schemaMarkup: ScoreDetail
    citations: ScoreDetail
    multimedia: ScoreDetail
    platformSpecific: ScoreDetail
  }
  suggestions: {
    immediate: Suggestion[]
    structural: Suggestion[]
    technical: Suggestion[]
  }
  percentile: number
  categoryTop?: number
  improvementPotential?: number
  metadata?: {
    url: string
    analyzedAt: string
    contentLength?: number
    readingTime?: number
    title?: string
    description?: string
  }
}
