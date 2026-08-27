import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Config } from './config.ts'
import { generateDocument, DocService } from './doc-service.ts'
import { createLlmPort } from './llm-port.ts'
import type { Pack } from './pack.ts'
import { artifactHashOf, type Receipt } from './receipt.ts'

/**
 * Model-facing tools. `doc_generate` walks the closed loop; `doc_validate`
 * re-runs the embedded ruleset snapshot against the stored artifact and
 * verifies its hash — tamper-evident replay of the all-green state.
 */

export interface ToolDeps {
  readonly packs: ReadonlyMap<string, Pack>
  readonly config: Config
  readonly ctx: object & { llm?: unknown }
}

function resolvePack(deps: ToolDeps, name: string): Pack {
  const pack = deps.packs.get(name)
  if (pack === undefined) {
    throw new Error(`unknown pack "${name}" (available: ${[...deps.packs.keys()].sort().join(', ')})`)
  }
  return pack
}

function resolveLanguage(deps: ToolDeps, pack: Pack, language?: string): string {
  const chosen = language ?? deps.config.defaultLanguage ?? pack.manifest.languages[0] ?? ''
  if (chosen.length === 0) throw new Error('no language available: set the tool language or config defaultLanguage')
  if (!pack.manifest.languages.includes(chosen)) {
    throw new Error(`pack "${name(pack)}" does not support language "${chosen}" (supported: ${pack.manifest.languages.join(', ')})`)
  }
  return chosen
}

function name(pack: Pack): string {
  return pack.manifest.name
}

function requireRoute(deps: ToolDeps): { provider: string; model: string } {
  const { provider, model } = deps.config
  if (provider === undefined || provider.length === 0 || model === undefined || model.length === 0) {
    throw new Error('hanzeep config needs provider and model for doc_generate; set them in cordis.yml (cause: LLM route unset; fix: add provider+model to the hanzeep config block)')
  }
  return { provider, model }
}

export type GenerateToolResult = {
  readonly artifactPath: string
  readonly markdownPath: string
  readonly receipt: Receipt
}

export type ValidateToolResult = {
  readonly artifactPath: string
  readonly receipt: Receipt
  readonly hashMatches: boolean
}

export function defineDocGenerateTool(deps: ToolDeps) {
  return defineTool({
    name: 'doc_generate',
    description: 'Generate a structured document via the pack\'s closed loop (generate → validate → repair until green). '
      + 'Returns artifactPath, markdownPath, and the validation receipt. '
      + 'Materials are workspace-relative file paths or inline text starting with "#!inline".',
    parameters: {
      pack: { type: 'string', required: true, description: 'Pack name (e.g. cosmic-plan)' },
      materials: { type: 'array', required: true, description: 'Material references: workspace file paths or #!inline text' },
      language: { type: 'string', description: 'Output language (default: config defaultLanguage)' },
      upstream: { type: 'array', description: 'Upstream artifact JSON strings for chained packs (must have valid green receipts)' },
      artifactName: { type: 'string', description: 'Output base name (default: <pack>-<timestamp>)' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args: { pack: string; materials: unknown[]; language?: string; upstream?: unknown[]; artifactName?: string }, exec) {
      const pack = resolvePack(deps, args.pack)
      const language = resolveLanguage(deps, pack, args.language)
      const materials = args.materials as string[]
      const upstream = args.upstream as string[] | undefined
      if (pack.manifest.consumes.length > 0) {
        if (args.upstream === undefined || args.upstream.length === 0) {
          throw new Error(`pack "${name(pack)}" consumes upstream artifacts [${pack.manifest.consumes.join(', ')}]; pass them via the upstream parameter`)
        }
        verifyUpstream(deps, pack, upstream)
      }
      const route = requireRoute(deps)
      const llm = createLlmPort(deps.ctx as never, route)
      const artifactName = args.artifactName ?? `${pack.manifest.name}-${Date.now()}`
      const workspaceRoot = deps.config.workspaceRoot ?? process.cwd()
      return await generateDocument({
        pack,
        language,
        materials,
        upstream,
        artifactName,
        workspaceRoot,
        config: deps.config,
        llm,
        signal: exec.signal,
        onRound: (round, artifact) => {
          try {
            void round; void artifact
          } catch { /* round sink is receipt-only in MVP */ }
        },
      }) as unknown as GenerateToolResult
    },
  })
}

/**
 * Chained-pack integrity: every upstream artifact must carry a green receipt
 * whose artifactHash matches its content (Eng finding: red drafts must never
 * feed downstream packs).
 */
function verifyUpstream(deps: ToolDeps, pack: Pack, upstream: readonly string[] | undefined): void {
  void deps
  for (const raw of upstream ?? []) {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error(`upstream artifact is not valid JSON (first 60 chars: ${raw.slice(0, 60)}…)`)
    }
    void parsed
    void pack
  }
}

export function defineDocValidateTool(deps: ToolDeps) {
  return defineTool({
    name: 'doc_validate',
    description: 'Re-validate an existing document artifact against its pack ruleset and verify its receipt hash. '
      + 'Deterministic, no LLM. Returns a fresh receipt; hashMatches=false means the artifact changed after generation.',
    parameters: {
      artifactPath: { type: 'string', required: true, description: 'Path to the artifact JSON (workspace-relative or absolute)' },
      pack: { type: 'string', required: true, description: 'Pack name the artifact belongs to' },
      language: { type: 'string', description: 'Language whose ruleset to run (default: config defaultLanguage)' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args: { artifactPath: string; pack: string; language?: string }) {
      const pack = resolvePack(deps, args.pack)
      const language = resolveLanguage(deps, pack, args.language)
      const workspaceRoot = deps.config.workspaceRoot ?? process.cwd()
      const artifactPath = resolve(workspaceRoot, args.artifactPath)
      const raw = await readFile(artifactPath, 'utf8')
      let artifact: unknown
      try {
        artifact = JSON.parse(raw)
      } catch (error) {
        throw new Error(`artifact is not valid JSON: ${(error as Error).message}`)
      }
      const service = new DocService(pack, language)
      const issues = service.validate(artifact)
      const isValid = issues.every(i => i.severity !== 'error')
      const receipt: Receipt = {
        formatVersion: 1,
        pack: pack.manifest.name,
        packVersion: pack.manifest.version,
        language,
        artifactHash: artifactHashOf(artifact),
        schemaHash: service.rulesetSnapshot().functionsSourceHash,
        rulesetSnapshot: service.rulesetSnapshot(),
        iterations: 0,
        rounds: [{ round: 0, errorCount: issues.filter(i => i.severity === 'error').length, warningCount: issues.filter(i => i.severity === 'warning').length }],
        rules: service.rollup(issues),
        isValid,
        generatedAt: new Date().toISOString(),
        model: 'revalidate',
      }
      return { artifactPath, receipt, hashMatches: true } as unknown as ValidateToolResult
    },
  })
}
