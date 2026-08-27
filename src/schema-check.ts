import Ajv from 'ajv'
import type { Issue } from './issue.ts'
import { truncateSnapshot } from './issue.ts'

/** Resolve a JSON Pointer-ish instancePath ('/functions/0/funcId') to its value. */
function valueAtPath(artifact: unknown, instancePath: string): unknown {
  let cur: unknown = artifact
  for (const seg of instancePath.split('/').filter(Boolean)) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[seg.replace(/~1/g, '/').replace(/~0/g, '~')]
  }
  return cur
}

/**
 * ajv-backed structural check. Compiler errors mean the pack's schema itself
 * is broken — a load-time concern surfaced before any generation runs.
 */
export function createSchemaCheck(schema: Record<string, unknown>, label = 'pack'): (artifact: unknown) => readonly Issue[] {
  const ajv = new Ajv({ allErrors: true, strict: false })
  let validate: import('ajv').ValidateFunction
  try {
    validate = ajv.compile(schema)
  } catch (error) {
    throw new Error(`${label}: schema.json does not compile (${(error as Error).message}); fix the pack's schema.json and reload`)
  }
  return (artifact: unknown): readonly Issue[] => {
    if (validate(artifact)) return []
    const errors = validate.errors ?? []
    return errors.map(e => ({
      ruleId: `schema/${e.keyword ?? 'unknown'}`,
      severity: 'error' as const,
      jsonPath: `#${e.instancePath || '$'}`,
      message: e.message ?? 'schema violation',
      snapshot: truncateSnapshot(valueAtPath(artifact, e.instancePath ?? '')),
      suggestion: `Fix the value at ${e.instancePath || 'the root'} to satisfy "${e.keyword ?? 'schema'}" — see the pack schema for the exact constraint.`,
    }))
  }
}
