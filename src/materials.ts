import { readFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'

/**
 * Material references: workspace-relative file paths, or inline text whose
 * first line is the explicit `#!inline` marker (no heuristics). Path
 * containment: resolved paths must stay inside the workspace root — `../..`
 * escapes that would suck secrets into prompts fail loud.
 */
export async function readMaterials(
  refs: readonly string[],
  workspaceRoot: string,
): Promise<readonly string[]> {
  if (refs.length === 0) {
    throw new Error('materials must not be empty: provide at least one material reference (a workspace file path or #!inline text)')
  }
  const root = resolve(workspaceRoot)
  const out: string[] = []
  for (const ref of refs) {
    if (ref.startsWith('#!inline')) {
      out.push(ref.slice('#!inline'.length).replace(/^\n/, ''))
      continue
    }
    const abs = isAbsolute(ref) ? resolve(ref) : resolve(root, ref)
    const rel = relative(root, abs)
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error(`material path escapes the workspace root: ${ref} (root: ${root})`)
    }
    try {
      out.push(await readFile(abs, 'utf8'))
    } catch (error) {
      throw new Error(`material not readable: ${ref} (${(error as Error).message})`)
    }
  }
  return out
}
