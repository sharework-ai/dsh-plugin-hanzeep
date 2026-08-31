import { relative, resolve } from 'node:path'
import { DEFAULT_MATERIALS_ROOT, DEFAULT_OUTPUT_ROOT } from './config.ts'

/**
 * Normalize a Windows drive-letter path (`D:\x\y` or `D:/x/y`) to its WSL
 * mount (`/mnt/d/x/y`), because a Linux-side tool otherwise treats the whole
 * backslash string as one filename. Only applied on Linux (a Windows host
 * resolves drive paths natively); everything else passes through unchanged.
 */
export function normalizeWindowsPath(ref: string): string {
  if (process.platform !== 'linux') return ref
  const match = /^([A-Za-z]):[\\/](.*)$/.exec(ref)
  if (match === null) return ref
  return `/mnt/${match[1]!.toLowerCase()}/${match[2]!.replace(/\\/g, '/')}`
}

/** Minimal execution-context shape hanzeep reads; avoids importing dsh types. */
export interface SessionWorkspaceCarrier {
  readonly agent?: { readonly session?: { readonly cwd?: string } } | undefined
}

/**
 * Per-call workspace root: the session's workspace directory (the
 * conversation's cwd, e.g. the folder picked in the dsh web UI) wins; a
 * session-less call (scripts, tests) falls back to config `workspaceRoot`,
 * then the process cwd.
 */
export function effectiveWorkspaceRoot(
  exec: SessionWorkspaceCarrier | undefined,
  configRoot: string | undefined,
): string {
  const sessionCwd = exec?.agent?.session?.cwd
  if (typeof sessionCwd === 'string' && sessionCwd.length > 0) return resolve(normalizeWindowsPath(sessionCwd))
  return resolve(configRoot !== undefined && configRoot.length > 0 ? normalizeWindowsPath(configRoot) : process.cwd())
}

/**
 * Resolve one configured root (`materialsRoot` / `outputRoot`) inside the
 * workspace root. A relative spec joins onto the workspace root; an absolute
 * spec is taken as-is; either way the result must stay lexically inside the
 * workspace root, because containment, receipts, and upstream verification
 * all anchor there. Escapes fail loud naming the config key.
 */
export function resolveRootWithin(
  workspaceRoot: string,
  spec: string | undefined,
  key: 'materialsRoot' | 'outputRoot',
): string {
  const root = resolve(workspaceRoot)
  const abs = resolve(root, spec ?? (key === 'materialsRoot' ? DEFAULT_MATERIALS_ROOT : DEFAULT_OUTPUT_ROOT))
  const rel = relative(root, abs)
  if (rel === '..' || rel.startsWith('../')) {
    throw new Error(`config ${key} escapes the workspace root: ${spec} (root: ${root})`)
  }
  return abs
}
