import z from "@deepseek-ai/schemastery";

//#region src/config.d.ts
/** Plugin configuration, overridable from cordis.yml (no hardcoded tunables). */
interface Config {
  /** Extra pack directories merged over the built-in packs/ (same-name wins). */
  packsDir?: string;
  /** Workspace root constraining material/artifact path resolution. */
  workspaceRoot?: string;
  /** Default language; falls back to the first pack's first language when unset. */
  defaultLanguage?: string;
  /** Repair-loop round cap. */
  maxIterations?: number;
  /** Rough token budget for one repair prompt; oversized artifacts fail loud. */
  promptTokenBudget?: number;
  /** Provider/model route for the LLM seam; required at first generate call. */
  provider?: string;
  model?: string;
}
declare const Config: z<Config>;
//# sourceMappingURL=config.d.ts.map
//#endregion
export { Config };
//# sourceMappingURL=config.d.ts.map