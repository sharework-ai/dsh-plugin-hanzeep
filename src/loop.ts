import type { Issue } from './issue.ts'
import { issueFingerprint } from './issue.ts'
import type { LlmPort } from './llm-port.ts'
import { withSingleRetry } from './llm-port.ts'
import { assembleGeneratorPrompt, assembleRepairPrompt, estimateTokens, extractJson } from './prompt.ts'
import type { ReceiptRound } from './receipt.ts'

/** Loop-internal issue rule ids; ride the same repair path as pack rules. */
export const INTERNAL_INVALID_OUTPUT = 'internal/invalid-output'
export const INTERNAL_LLM_ERROR = 'internal/llm-error'

export interface LoopOptions {
  readonly llm: LlmPort
  readonly promptTemplate: string
  readonly materials: readonly string[]
  readonly upstream?: readonly string[] | undefined
  readonly maxIterations: number
  readonly promptTokenBudget: number
  readonly model: string
  readonly signal?: AbortSignal | undefined
  /** Validates the current artifact; returns issues ([] = all green). */
  validate(artifact: unknown): readonly Issue[]
}

export interface LoopRoundEvent {
  readonly round: number
  readonly promptTokens: number
  readonly errorCount: number
  readonly warningCount: number
  readonly fingerprintsMatchedPrevious: boolean
}

export interface LoopSuccess {
  readonly status: 'green'
  readonly artifact: unknown
  readonly iterations: number
  readonly rounds: ReceiptRound[]
  readonly events: LoopRoundEvent[]
}

export interface LoopExhausted {
  readonly status: 'exhausted'
  /** Last draft kept for manual rescue; NOT an official artifact (red receipt). */
  readonly draftArtifact: unknown
  readonly iterations: number
  readonly rounds: ReceiptRound[]
  readonly events: LoopRoundEvent[]
  readonly unresolved: Issue[]
}

export type LoopResult = LoopSuccess | LoopExhausted

function severityCounts(issues: readonly Issue[]): { errors: number; warnings: number } {
  let errors = 0
  let warnings = 0
  for (const i of issues) {
    if (i.severity === 'error') errors++
    else if (i.severity === 'warning') warnings++
  }
  return { errors, warnings }
}

/**
 * The closed repair loop: generate → validate → repair-until-green.
 * Oscillation guard: two consecutive rounds with an unchanged issue
 * fingerprint terminate early (fix A broke B loops burn iterations for
 * nothing). Every round persists through the round event sink so a crash
 * never loses the draft.
 */
export async function runRepairLoop(
  options: LoopOptions,
  onRound: (event: LoopRoundEvent, artifact: unknown) => void,
): Promise<LoopResult> {
  const rounds: ReceiptRound[] = []
  const events: LoopRoundEvent[] = []
  let previousFingerprint = ''
  let repeatedCount = 0

  let artifact: unknown
  let request = assembleGeneratorPrompt({
    promptTemplate: options.promptTemplate,
    materials: options.materials,
    upstream: options.upstream,
  })
  let iterations = 0

  while (iterations < options.maxIterations) {
    const budget = estimateTokens(request) + estimateTokens(JSON.stringify(artifact ?? ''))
    if (budget > options.promptTokenBudget) {
      throw new Error(`repair prompt exceeds token budget (${budget} > ${options.promptTokenBudget}); partition the materials or raise promptTokenBudget in config`)
    }
    options.signal?.throwIfAborted()

    iterations++
    let text: string
    try {
      text = await withSingleRetry(() => options.llm.complete({ system: '', user: request, signal: options.signal }))
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw error
      const llmIssues: Issue[] = [{
        ruleId: INTERNAL_LLM_ERROR,
        severity: 'error',
        jsonPath: '$',
        message: `model call failed: ${(error as Error).message}`,
        suggestion: 'Retry the doc_generate call; if it persists, check provider config (provider/model) and network.',
      }]
      const counts = severityCounts(llmIssues)
      const ev: LoopRoundEvent = { round: iterations, promptTokens: budget, errorCount: counts.errors, warningCount: counts.warnings, fingerprintsMatchedPrevious: false }
      events.push(ev)
      rounds.push({ round: iterations, errorCount: counts.errors, warningCount: counts.warnings })
      onRound(ev, artifact ?? null)
      return { status: 'exhausted', draftArtifact: artifact ?? null, iterations, rounds, events, unresolved: llmIssues }
    }

    let parseIssue: Issue | undefined
    try {
      artifact = extractJson(text)
    } catch (error) {
      parseIssue = {
        ruleId: INTERNAL_INVALID_OUTPUT,
        severity: 'error',
        jsonPath: '$',
        message: (error as Error).message,
        suggestion: 'Return the complete JSON document as the entire reply, no prose around it.',
      }
      artifact = artifact ?? null
    }

    const issues = parseIssue === undefined ? options.validate(artifact) : [parseIssue]
    const counts = severityCounts(issues)
    const fingerprint = issueFingerprint(issues)
    const repeated = fingerprint === previousFingerprint
    repeatedCount = repeated ? repeatedCount + 1 : 0
    previousFingerprint = fingerprint

    const ev: LoopRoundEvent = { round: iterations, promptTokens: budget, errorCount: counts.errors, warningCount: counts.warnings, fingerprintsMatchedPrevious: repeated }
    events.push(ev)
    rounds.push({ round: iterations, errorCount: counts.errors, warningCount: counts.warnings })
    onRound(ev, artifact)

    if (counts.errors === 0) {
      return { status: 'green', artifact, iterations, rounds, events }
    }
    if (repeatedCount >= 1) {
      return { status: 'exhausted', draftArtifact: artifact, iterations, rounds, events, unresolved: [...issues] }
    }
    request = assembleRepairPrompt({
      promptTemplate: options.promptTemplate,
      originalRequest: assembleGeneratorPrompt({ promptTemplate: options.promptTemplate, materials: options.materials, upstream: options.upstream }),
      artifact,
      issues,
    })
  }
  return {
    status: 'exhausted',
    draftArtifact: artifact ?? null,
    iterations,
    rounds,
    events,
    unresolved: [...options.validate(artifact ?? null)],
  }
}
