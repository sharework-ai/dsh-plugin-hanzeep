import { describe, expect, it } from 'vitest'
import { assembleGeneratorPrompt, assembleRepairPrompt, estimateTokens, extractJson } from '../src/prompt.ts'
import { artifactHashOf, canonicalJson, RECEIPT_FORMAT_VERSION } from '../src/receipt.ts'
import { createRenderer } from '../src/render.ts'
import { truncateSnapshot } from '../src/issue.ts'
import { fileURLToPath } from 'node:url'

function packsRoot(): string {
  return fileURLToPath(new URL('../packs', import.meta.url))
}


describe('prompt assembly', () => {
  it('wraps materials and upstream in tagged blocks', () => {
    const out = assembleGeneratorPrompt({ promptTemplate: 'TPL {{materials}} {{upstream}}', materials: ['a', 'b'], upstream: ['{"u":1}'] })
    expect(out).toContain('<material>\na\n</material>')
    expect(out).toContain('<upstream-artifacts>')
  })

  it('omits the upstream block when absent', () => {
    const out = assembleGeneratorPrompt({ promptTemplate: 'TPL {{materials}} {{upstream}}', materials: ['a'] })
    expect(out).not.toContain('<upstream-artifacts>')
  })

  it('groups repair issues by jsonPath with suggestions', () => {
    const out = assembleRepairPrompt({
      promptTemplate: 'TPL',
      originalRequest: 'GEN',
      artifact: { a: 1 },
      issues: [
        { ruleId: 'r1', severity: 'error', jsonPath: '$.x', message: 'm1', suggestion: 's1' },
        { ruleId: 'r2', severity: 'error', jsonPath: '$.x', message: 'm2', suggestion: 's2' },
      ],
    })
    expect(out).toContain('$.x:')
    expect(out).toContain('fix: s1')
    expect(out).toContain('fix: s2')
  })

  it('estimates tokens as chars/4', () => {
    expect(estimateTokens('1234')).toBe(1)
  })
})

describe('extractJson', () => {
  it('parses fenced JSON', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })
  it('parses JSON with trailing prose', () => {
    expect(extractJson('Here you go: {"a":{"b":2}} hope it helps')).toEqual({ a: { b: 2 } })
  })
  it('throws when no object exists', () => {
    expect(() => extractJson('no json')).toThrow(/no JSON object/)
  })
  it('throws when nothing parses', () => {
    expect(() => extractJson('{broken}')).toThrow(/malformed|no parseable/)
  })
})

describe('receipt hashing', () => {
  it('canonical json is key-order independent', () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe(canonicalJson({ a: [2, { c: 4, d: 3 }], b: 1 }))
  })
  it('artifact hash changes when content changes', () => {
    expect(artifactHashOf({ a: 1 })).not.toBe(artifactHashOf({ a: 2 }))
  })
  it('format version is exported', () => {
    expect(RECEIPT_FORMAT_VERSION).toBe(1)
  })
})

describe('markdown render', () => {
  it('renders a plan document through the handlebars template', async () => {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const template = await readFile(join(packsRoot(), 'cosmic-plan', 'templates', 'zh-CN.hbs'), 'utf8')
    const golden = JSON.parse(await readFile(join(packsRoot(), 'cosmic-plan', 'samples', 'golden.json'), 'utf8'))
    const render = createRenderer(template)
    const md = render(golden)
    expect(md.trim().length).toBeGreaterThan(0)
    expect(md).toContain(String(golden.functions[0].funcId))
  })
  it('throws on empty render', () => {
    expect(() => createRenderer('')({})).toThrow(/does not compile|empty/)
  })
})

describe('issue helpers', () => {
  it('truncates long snapshots', () => {
    expect(truncateSnapshot('x'.repeat(200)).length).toBeLessThanOrEqual(81)
  })
  it('stringifies non-strings', () => {
    expect(truncateSnapshot(42)).toBe('42')
  })
})
