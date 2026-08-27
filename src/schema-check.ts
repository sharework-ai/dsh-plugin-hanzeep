import Ajv from 'ajv'
import type { Issue } from './issue.ts'
import { truncateSnapshot } from './issue.ts'

/**
 * ajv-backed structural check. Compiler errors mean the pack's schema itself
 * is broken — that is a load-time concern, so this function throws and the
 * loader's caller surfaces it before any generation runs.
 */
export function createSchemaCheck(schema: Record<string, unknown>): (artifact: unknown) => readonly Issue[] {
  const ajv = new Ajv({ allErrors: true, strict: false })
  let validate: import('ajv').ValidateFunction
  try {
    validate = ajv.compile(schema)
  } catch (error) {
    throw new Error(`schema does not compile: ${(error as Error).message}`)
  }
  return (artifact: unknown): readonly Issue[] => {
    if (validate(artifact)) return []
    const errors = validate.errors ?? []
    return errors.map(e => ({
      ruleId: `schema/${e.keyword ?? 'unknown'}`,
      severity: 'error' as const,
      jsonPath: `#${e.instancePath || '$'}`,
      message: e.message ?? 'schema violation',
      snapshot: truncateSnapshot(JSON.stringify(artifact)?.slice(0, 60) ?? 'undefined'),
      suggestion: `Make the value at ${e.instancePath || 'the root'} satisfy "${e.keyword ?? 'schema'}" — see the pack schema for the exact constraint.`,
    }))
  }
}
