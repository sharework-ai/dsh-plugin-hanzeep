import type { Context } from '@deepseek-ai/cordis'
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { LlmRuntime, GenerateOptions } from '@deepseek-ai/dsh-llm'

/**
 * Single LLM seam (decision: plugins, not loop changes). Adapters are
 * single-attempt by contract, so adapter throws surface here as errors the
 * loop maps to `internal/llm-error` issues; one bounded retry covers
 * transient transport failures.
 */
export interface LlmPort {
  /** One model call returning assembled text. Throws on transport failure. */
  complete(input: { system: string; user: string; maxTokens?: number | undefined; signal?: AbortSignal | undefined }): Promise<string>
}

export interface LlmRoute {
  readonly provider: string
  readonly model: string
}

export function createLlmPort(ctx: Context, route: LlmRoute): LlmPort {
  const llm = (ctx as Context & { llm: LlmRuntime }).llm
  if (llm === undefined) throw new Error('hanzeep: ctx.llm is not available; inject the dsh llm plugin before hanzeep')
  return {
    async complete({ system, user, maxTokens, signal }) {
      const options: GenerateOptions = {
        provider: route.provider,
        model: route.model,
        system,
        messages: [createUserMessage({ content: [{ type: 'text', text: user }], source: { kind: 'plugin', plugin: 'hanzeep' } })],
        ...(maxTokens === undefined ? {} : { maxTokens }),
        ...(signal === undefined ? {} : { signal }),
      }
      const assembler = new BlockAssembler()
      for await (const chunk of llm.stream(options)) {
        signal?.throwIfAborted()
        assembler.push(chunk)
      }
      const blocks = assembler.blocks()
      const text = blocks.filter((b): b is Extract<(typeof blocks)[number], { type: 'text' }> => b.type === 'text').map(b => b.text).join('')
      if (text.length === 0) throw new Error('llm returned no text blocks')
      return text
    },
  }
}

/** One bounded retry for transient adapter failures (429/network). */
export async function withSingleRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (error !== undefined && (error as Error).name === 'AbortError') throw error
    return await fn()
  }
}
