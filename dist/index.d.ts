import { Config } from "./config.js";
import { DeclarativeRule, FunctionRule, Pack, PackManifest, RuleIssue } from "./pack.js";
import { runRepairLoop } from "./loop.js";
import { DocService, generateDocument } from "./doc-service.js";
import { Context } from "@deepseek-ai/cordis";

//#region src/index.d.ts

/**
 * hanzeep — closed-loop document generation for deepseek-harness.
 * JSON is the single source of truth; every document ships with a
 * replayable validation receipt. See docs/designs/hanzeep-mvp.md.
 * @module dsh-plugin-hanzeep
 */
declare const name = "hanzeep";
declare const inject: string[];
declare function apply(ctx: Context, config: Config): Promise<void>;
/**
 * Pack loading is apply-time (decision #9): load failures — bad manifest,
 * broken ruleset, missing Config-default language — fail loud here.
 * Split from {@link apply} so the packs root is injectable for tests.
 */
declare function registerTools(ctx: Context, config: Config, builtinRoot: string): Promise<void>;
//# sourceMappingURL=index.d.ts.map
//#endregion
export { Config, DeclarativeRule, DocService, FunctionRule, type Config as HanzeepConfig, Pack, PackManifest, RuleIssue, apply, generateDocument, inject, name, registerTools, runRepairLoop };
//# sourceMappingURL=index.d.ts.map