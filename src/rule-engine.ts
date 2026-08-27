import type { DeclarativeRule, FunctionRule, Pack } from './pack.ts'
import type { Issue } from './issue.ts'
import { truncateSnapshot } from './issue.ts'

/**
 * Mini rule engine (bake-off winner over @stoplight/spectral-core; see
 * docs/designs/hanzeep-mvp.md Approach A: probe found CJS-only packaging and
 * custom-function wiring friction; every COSMIC rule family maps here in
 * ~100 lines). Runs declarative rules then function rules over the artifact.
 */

function scopeFor(artifact: unknown, given: string): { items: readonly unknown[]; parent: unknown } {
  // `given` forms: `$.functions[*]` (array of objects) or `$` (whole doc).
  const arrayMatch = /^\$\.([A-Za-z0-9_]+)\[\*\]$/.exec(given)
  if (arrayMatch === null) {
    if (given !== '$') throw new Error(`rule given path not supported: ${given} (supported: $, $.field[*])`)
    return { items: [artifact], parent: artifact }
  }
  const key = arrayMatch[1] ?? ''
  const value = (artifact as Record<string, unknown> | null)?.[key]
  if (!Array.isArray(value)) {
    // Empty path is schema's business; an absent array simply yields no items.
    return { items: [], parent: artifact }
  }
  return { items: value, parent: value }
}

function checkField(rule: DeclarativeRule, item: unknown, index: number): Issue | undefined {
  const obj = item as Record<string, unknown> | null
  const value = obj?.[rule.field]
  const jsonPath = `$.${rule.given === '$' ? '' : `${rule.given.slice(2)}.`}${rule.field}`.replace('..', '.')
  const at = rule.given === '$' ? jsonPath : `${rule.given.slice(0, -3)}[${index}].${rule.field}`
  const snapshot = truncateSnapshot(value)
  switch (rule.kind) {
    case 'minLength': {
      const len = typeof value === 'string' ? value.length : -1
      return len >= rule.min ? undefined : { ruleId: rule.id, severity: rule.severity, jsonPath: at, message: `length ${len} < min ${rule.min}`, ...(snapshot === undefined ? {} : { snapshot }), suggestion: rule.suggestion }
    }
    case 'maxLength': {
      const len = typeof value === 'string' ? value.length : Number.POSITIVE_INFINITY
      return len <= rule.max ? undefined : { ruleId: rule.id, severity: rule.severity, jsonPath: at, message: `length ${len} > max ${rule.max}`, ...(snapshot === undefined ? {} : { snapshot }), suggestion: rule.suggestion }
    }
    case 'forbiddenKeywords': {
      const text = typeof value === 'string' ? value : ''
      const hit = rule.keywords.find(k => text.includes(k))
      return hit === undefined ? undefined : { ruleId: rule.id, severity: rule.severity, jsonPath: at, message: `forbidden keyword "${hit}"`, ...(snapshot === undefined ? {} : { snapshot }), suggestion: rule.suggestion }
    }
    case 'pattern': {
      const text = typeof value === 'string' ? value : ''
      let re: RegExp
      try {
        re = new RegExp(rule.pattern)
      } catch (error) {
        throw new Error(`rule ${rule.id}: invalid pattern "${rule.pattern}": ${(error as Error).message}`)
      }
      const matches = re.test(text)
      return matches === rule.mustMatch ? undefined : { ruleId: rule.id, severity: rule.severity, jsonPath: at, message: `pattern "${rule.pattern}" ${rule.mustMatch ? 'not matched' : 'matched (forbidden)'}`, ...(snapshot === undefined ? {} : { snapshot }), suggestion: rule.suggestion }
    }
  }
}

export function createRuleEngine(pack: Pack, language: string): (artifact: unknown) => readonly Issue[] {
  const declarative = pack.rules.get(language)
  if (declarative === undefined) {
    throw new Error(`pack ${pack.manifest.name} has no rules for language "${language}"`)
  }
  const fnRules: readonly FunctionRule[] = pack.functionRules
  return (artifact: unknown): readonly Issue[] => {
    const issues: Issue[] = []
    for (const rule of declarative) {
      const { items } = scopeFor(artifact, rule.given)
      items.forEach((item, index) => {
        const issue = checkField(rule, item, index)
        if (issue !== undefined) issues.push(issue)
      })
    }
    for (const rule of fnRules) {
      try {
        for (const found of rule.check(artifact)) {
          issues.push({ ruleId: rule.id, severity: rule.severity, jsonPath: found.jsonPath, message: found.message, ...(found.snapshot === undefined ? {} : { snapshot: found.snapshot }), suggestion: rule.suggestion })
        }
      } catch (error) {
        throw new Error(`rule ${rule.id} crashed: ${(error as Error).message}`)
      }
    }
    return issues
  }
}

/** Issue set → per-rule pass/fail rollup for receipts. */
export function rollupRules(pack: Pack, language: string, issues: readonly Issue[]): { ruleId: string; severity: string; status: 'pass' | 'fail'; count: number }[] {
  const failed = new Map<string, number>()
  for (const i of issues) failed.set(i.ruleId, (failed.get(i.ruleId) ?? 0) + 1)
  const ids = new Set<string>([
    ...(pack.rules.get(language) ?? []).map(r => r.id),
    ...pack.functionRules.map(r => r.id),
    'schema/*',
  ])
  return [...ids].sort().map(ruleId => ({
    ruleId,
    severity: ruleId === 'schema/*' ? 'error' : 'error',
    status: failed.has(ruleId) ? ('fail' as const) : ('pass' as const),
    count: failed.get(ruleId) ?? 0,
  }))
}
