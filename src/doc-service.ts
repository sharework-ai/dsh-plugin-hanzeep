import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { Config } from './config.ts'
import type { Issue } from './issue.ts'
import type { LlmPort } from './llm-port.ts'
import { runRepairLoop, type LoopResult } from './loop.ts'
import type { Pack } from './pack.ts'
import { createRuleEngine, rollupRules } from './rule-engine.ts'
import { readMaterials } from './materials.ts'
import { assembleGeneratorPrompt, estimateTokens } from './prompt.ts'
import { createSchemaCheck } from './schema-check.ts'
import { artifactHashOf, RECEIPT_FORMAT_VERSION, sha256, type Json, type Receipt } from './receipt.ts'
import { createRenderer } from './render.ts'

/**
 * Pack-scoped doc service shared by the two tools. One instance per
 * (pack, language) so schema/rule/render compilation happens once.
 */
export class DocService {
  private readonly schemaCheck: (artifact: unknown) => readonly Issue[]
  private readonly ruleEngine: (artifact: unknown) => readonly Issue[]
  readonly renderer: (artifact: unknown) => string
  readonly promptTemplate: string

  constructor(
    readonly pack: Pack,
    readonly language: string,
  ) {
    if (!pack.manifest.languages.includes(language)) {
      throw new Error(`pack "${pack.manifest.name}" does not support language "${language}" (supported: ${pack.manifest.languages.join(', ')})`)
    }
    this.promptTemplate = pack.prompts.get(language) ?? ''
    this.schemaCheck = createSchemaCheck(pack.schema)
    this.ruleEngine = createRuleEngine(pack, language)
    this.renderer = createRenderer(pack.templates.get(language) ?? '')
  }

  validate(artifact: unknown): readonly Issue[] {
    return [...this.schemaCheck(artifact), ...this.ruleEngine(artifact)]
  }

  rulesetSnapshot(): Receipt['rulesetSnapshot'] {
    return {
      declarative: (this.pack.rules.get(this.language) ?? []) as unknown as Record<string, Json>[],
      functionsSourceHash: sha256(JSON.stringify(this.pack.functionRules.map(r => ({ id: r.id, suggestion: r.suggestion })))),
    }
  }

  rollup(issues: readonly Issue[]): Receipt['rules'] {
    return rollupRules(this.pack, this.language, issues)
  }

  buildReceipt(input: {
    result: LoopResult
    model: string
  }): Receipt {
    const artifact = input.result.status === 'green' ? input.result.artifact : input.result.draftArtifact
    const isValid = input.result.status === 'green'
    const finalIssues = isValid ? [] : (input.result as { unresolved: readonly Issue[] }).unresolved
    return {
      formatVersion: RECEIPT_FORMAT_VERSION,
      pack: this.pack.manifest.name,
      packVersion: this.pack.manifest.version,
      language: this.language,
      artifactHash: artifactHashOf(artifact),
      schemaHash: sha256(JSON.stringify(this.pack.schema)),
      rulesetSnapshot: this.rulesetSnapshot(),
      iterations: input.result.iterations,
      rounds: input.result.rounds,
      rules: this.rollup(finalIssues),
      isValid,
      generatedAt: new Date().toISOString(),
      model: input.model,
    }
  }
}

export interface GenerateInput {
  readonly pack: Pack
  readonly language: string
  readonly materials: readonly string[]
  readonly upstream?: readonly string[] | undefined
  readonly artifactName: string
  readonly workspaceRoot: string
  readonly config: Config
  readonly llm: LlmPort
  readonly signal?: AbortSignal | undefined
  readonly onRound: (round: number, artifact: unknown) => void
}

export interface GenerateOutput {
  readonly artifactPath: string
  readonly markdownPath: string
  readonly receipt: Receipt
}

/**
 * doc_generate core: token pre-check → closed loop → persist artifact,
 * markdown, and sidecar receipt. Exhausted loops still write the draft and
 * a red receipt (fail loud, nothing silent).
 */
export async function generateDocument(input: GenerateInput): Promise<GenerateOutput> {
  const service = new DocService(input.pack, input.language)
  const materialTexts = await readMaterials(input.materials, input.workspaceRoot)
  const firstPrompt = assembleGeneratorPrompt({ promptTemplate: service.promptTemplate, materials: materialTexts, upstream: input.upstream })
  const budget = estimateTokens(firstPrompt)
  const tokenBudget = input.config.promptTokenBudget ?? 60_000
  if (budget > tokenBudget) {
    throw new Error(`generator prompt exceeds token budget (${budget} > ${tokenBudget}); reduce materials or raise promptTokenBudget`)
  }
  const result = await runRepairLoop(
    {
      llm: input.llm,
      promptTemplate: service.promptTemplate,
      materials: materialTexts,
      upstream: input.upstream,
      maxIterations: input.config.maxIterations ?? 5,
      promptTokenBudget: tokenBudget,
      model: input.config.model ?? 'unknown',
      signal: input.signal,
      validate: artifact => service.validate(artifact),
    },
    (event, artifact) => input.onRound(event.round, artifact),
  )

  const model = input.config.model ?? 'unknown'
  const receipt = service.buildReceipt({ result, model })
  const artifact = result.status === 'green' ? result.artifact : result.draftArtifact

  const outDir = resolve(input.workspaceRoot, 'output')
  await mkdir(outDir, { recursive: true })
  const artifactPath = join(outDir, `${input.artifactName}.json`)
  const receiptPath = join(outDir, `${input.artifactName}.receipt.json`)
  const markdownPath = join(outDir, `${input.artifactName}.md`)
  // Draft-first persistence: the artifact lands on disk before the receipt so
  // any crash between writes leaves a readable draft, never an orphan receipt.
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8')
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8')
  const markdown = service.renderer(artifact)
  await writeFile(markdownPath, markdown, 'utf8')
  void dirname(receiptPath)

  if (result.status === 'exhausted') {
    throw new Error(`doc_generate exhausted after ${result.iterations} iterations without going green; draft + red receipt kept at ${artifactPath}. Unresolved: ${result.unresolved.slice(0, 5).map(i => i.ruleId).join(', ')}${result.unresolved.length > 5 ? '…' : ''}`)
  }
  return { artifactPath, markdownPath, receipt }
}
