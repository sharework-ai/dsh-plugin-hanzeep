import { readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { DeclarativeRule, FunctionRule, Pack, PackManifest, RuleIssue } from './pack.ts'
import type { Severity } from './issue.ts'
import { truncateSnapshot } from './issue.ts'

/**
 * Directory-convention loader. Built-in packs ship inside the package;
 * `packsDir` entries override same-name packs (DX-H3 merge semantics).
 * Loading validates manifests, rulesets, and language coverage loudly:
 * a pack whose Config-default language is missing fails at plugin apply.
 */

interface RawPackDirs {
  readonly extra?: readonly string[] | undefined
}

function assertManifest(raw: unknown, dir: string): PackManifest {
  if (typeof raw !== 'object' || raw === null) throw new Error(`pack ${dir}: manifest.json must be an object`)
  const m = raw as Partial<PackManifest>
  if (typeof m.name !== 'string' || m.name.length === 0) throw new Error(`pack ${dir}: manifest.name must be a non-empty string`)
  if (typeof m.version !== 'string' || m.version.length === 0) throw new Error(`pack ${dir}: manifest.version must be a non-empty string`)
  if (!Array.isArray(m.languages) || m.languages.length === 0) throw new Error(`pack ${dir}: manifest.languages must be a non-empty array`)
  if (m.languages.some(l => typeof l !== 'string' || l.length === 0)) throw new Error(`pack ${dir}: manifest.languages entries must be non-empty strings`)
  if (m.consumes !== undefined && !Array.isArray(m.consumes)) throw new Error(`pack ${dir}: manifest.consumes must be an array when present`)
  return { name: m.name, version: m.version, consumes: m.consumes ?? [], languages: m.languages }
}

function assertRule(raw: unknown, dir: string, i: number): DeclarativeRule {
  if (typeof raw !== 'object' || raw === null) throw new Error(`pack ${dir}: rules[${i}] must be an object`)
  const r = raw as Record<string, unknown>
  const base = { id: r.id, severity: r.severity as Severity, given: r.given, field: r.field, suggestion: r.suggestion }
  for (const [k, v] of Object.entries(base)) {
    if (typeof v !== 'string' || v.length === 0) throw new Error(`pack ${dir}: rules[${i}].${k} must be a non-empty string`)
  }
  if (!['minLength', 'maxLength', 'forbiddenKeywords', 'pattern'].includes(String(r.kind))) {
    throw new Error(`pack ${dir}: rules[${i}].kind must be one of minLength|maxLength|forbiddenKeywords|pattern`)
  }
  // suggestion presence is enforced by the non-empty-string loop above
  return r as unknown as DeclarativeRule
}

/** Function-rule modules authored by pack maintainers; validated on load. */
async function loadFunctionRules(dir: string, manifest: PackManifest): Promise<readonly FunctionRule[]> {
  const rulesPath = join(dir, 'rules', 'functions.js')
  let mod: Record<string, unknown>
  try {
    mod = await import(rulesPath)
  } catch {
    return []
  }
  const exported = mod.rules
  if (exported === undefined) throw new Error(`pack ${dir}: rules/functions.js must export a \`rules\` array`)
  if (!Array.isArray(exported)) throw new Error(`pack ${dir}: rules/functions.js \`rules\` must be an array`)
  return exported.map((raw, i) => {
    const r = raw as Partial<FunctionRule>
    if (typeof r.id !== 'string' || r.id.length === 0) throw new Error(`pack ${dir}: functions.rules[${i}].id must be a non-empty string`)
    if (typeof r.suggestion !== 'string' || r.suggestion.length === 0) throw new Error(`pack ${dir}: functions.rules[${i}] must carry a suggestion`)
    if (typeof r.check !== 'function') throw new Error(`pack ${dir}: functions.rules[${i}].check must be a function`)
    if (!manifest.languages.includes('') && r.severity !== undefined && !['error', 'warning', 'info'].includes(r.severity)) {
      throw new Error(`pack ${dir}: functions.rules[${i}].severity must be error|warning|info`)
    }
    return { ...r, severity: r.severity ?? 'error' } as FunctionRule
  })
}

async function loadOnePack(dir: string): Promise<Pack> {
  const manifest = assertManifest(JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8')), dir)
  const schema = JSON.parse(await readFile(join(dir, 'schema.json'), 'utf8')) as Record<string, unknown>

  const rules = new Map<string, readonly DeclarativeRule[]>()
  const prompts = new Map<string, string>()
  const templates = new Map<string, string>()
  for (const lang of manifest.languages) {
    const rawRules = JSON.parse(await readFile(join(dir, 'rules', `${lang}.json`), 'utf8')) as unknown[]
    if (!Array.isArray(rawRules)) throw new Error(`pack ${dir}: rules/${lang}.json must be an array`)
    rules.set(lang, rawRules.map((r, i) => assertRule(r, dir, i)))
    prompts.set(lang, await readFile(join(dir, 'prompts', `${lang}.md`), 'utf8'))
    templates.set(lang, await readFile(join(dir, 'templates', `${lang}.hbs`), 'utf8'))
  }
  const goldenSample = JSON.parse(await readFile(join(dir, 'samples', 'golden.json'), 'utf8'))
  const functionRules = await loadFunctionRules(dir, manifest)
  return { manifest, schema, rules, functionRules, prompts, templates, goldenSample, dir }
}

async function listPackRoots(root: string): Promise<readonly string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true })
    return entries.filter(e => e.isDirectory()).map(e => join(root, e.name))
  } catch {
    return []
  }
}

/**
 * Load built-in packs then `packsDir` overrides. Same-name later entries win
 * (Config over built-in); failures inside a directory fail loud (ruleset
 * syntax belongs to load time, decision #11).
 */
export async function loadPacks(builtinRoot: string, dirs: RawPackDirs): Promise<ReadonlyMap<string, Pack>> {
  const roots = [builtinRoot, ...(dirs.extra ?? [])]
  const packs = new Map<string, Pack>()
  for (const root of roots) {
    for (const dir of await listPackRoots(root)) {
      const pack = await loadOnePack(dir)
      packs.set(pack.manifest.name, pack)
    }
  }
  return packs
}

/** Re-export for the tools' internal errors. */
export { truncateSnapshot }
export type { RuleIssue }
