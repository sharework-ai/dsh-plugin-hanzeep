import { Context } from "@deepseek-ai/cordis";

//#region src/llm-port.d.ts

/**
 * Single LLM seam (decision: plugins, not loop changes). Adapters are
 * single-attempt by contract, so adapter throws surface here as errors the
 * loop maps to `internal/llm-error` issues; one bounded retry covers
 * transient transport failures.
 */
interface LlmPort {
  /** One model call returning assembled text. Throws on transport failure. */
  complete(input: {
    system: string;
    user: string;
    maxTokens?: number | undefined;
    signal?: AbortSignal | undefined;
  }): Promise<string>;
}
//#endregion
export { LlmPort };
//# sourceMappingURL=llm-port.d.ts.map