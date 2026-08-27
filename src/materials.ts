import { readFile, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'

/**
 * Material references: workspace-relative file paths, or inline text whose
 * first line is the explicit `#!inline` marker (no heuristics). Containment
 * is enforced twice: lexically first (so `../..` gets a clear traversal
 * error even for nonexistent paths), then on REAL paths (so a symlink inside
 * the workspace that points outside it is rejected too). Both keep secrets
 * out of prompts.
 */
export async function readMaterials(
  refs: readonly string[],
  workspaceRoot: string,
): Promise<readonly string[]> {
  if (refs.length === 0) {
    throw new Error('materials must not be empty: provide at least one material reference (a workspace file path or #!inline text)')
  }
  const root = await realpath(resolve(workspaceRoot))
  const out: string[] = []
  for (const ref of refs) {
    if (typeof ref !== 'string') {
      throw new Error(`material reference must be a string, got ${JSON.stringify(ref)}`)
    }
    if (ref.startsWith('#!inline')) {
      out.push(ref.slice('#!inline'.length).replace(/^\n/, ''))
      continue
    }
    const abs = resolve(root, ref)
    const lexicalRel = relative(root, abs)
    if (lexicalRel === '..' || lexicalRel.startsWith('../') || isAbsolute(lexicalRel)) {
      throw new Error(`material path escapes the workspace root: ${ref} (root: ${root})`)
    }
    let real: string
    try {
      real = await realpath(abs)
    } catch (error) {
      throw new Error(`material not readable: ${ref} (${(error as Error).message})`)
    }
    const realRel = relative(root, real)
    if (realRel === '..' || realRel.startsWith('../') || isAbsolute(realRel)) {
      throw new Error(`material path escapes the workspace root via symlink: ${ref} (root: ${root})`)
    }
    out.push(await readFile(real, 'utf8'))
  }
  return out
}
