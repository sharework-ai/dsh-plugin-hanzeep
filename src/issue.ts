/** Severity levels mirroring the pack rule families (ERROR blocks green). */
export type Severity = 'error' | 'warning' | 'info'

/**
 * Unified validation finding. Every checker (ajv schema, declarative rules,
 * JS function rules, internal loop errors) maps to this single shape so the
 * repair prompt, receipt, and reports consume one format.
 */
export interface Issue {
  readonly ruleId: string
  readonly severity: Severity
  /** Dot-separated JSON path into the artifact, `$.functions[0].funcId` style. */
  readonly jsonPath: string
  readonly message: string
  /** Offending value excerpt; omit only when the path itself is absent. */
  readonly snapshot?: string
  /** Actionable fix; required for ERROR rules (DX contract). */
  readonly suggestion?: string
}

/** Stable signature of an issue for oscillation detection. */
export function issueFingerprint(issues: readonly Issue[]): string {
  return issues
    .map(i => `${i.ruleId}|${i.jsonPath}|${i.message}`)
    .sort()
    .join('\n')
}

export function truncateSnapshot(value: unknown, max = 80): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (text === undefined) return 'undefined'
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/** Error/warning tallies shared by the loop, receipts, and tools. */
export function severityCounts(issues: readonly Issue[]): { errors: number; warnings: number } {
  let errors = 0
  let warnings = 0
  for (const i of issues) {
    if (i.severity === 'error') errors++
    else if (i.severity === 'warning') warnings++
  }
  return { errors, warnings }
}

/** AbortError test shared by the loop and the LLM port (cancellation must propagate, not become a red receipt). */
export function isAbortError(error: unknown): boolean {
  return (error as Error | undefined)?.name === 'AbortError'
}
