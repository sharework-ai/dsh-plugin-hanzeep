import { Config } from "./config.js";
import { loadPacks } from "./pack-loader.js";
import { runRepairLoop } from "./loop.js";
import { DocService, generateDocument } from "./doc-service.js";
import { defineDocGenerateTool, defineDocValidateTool } from "./tools.js";
import { join } from "node:path";
//#region src/index.ts
/**
* hanzeep — closed-loop document generation for deepseek-harness.
* JSON is the single source of truth; every document ships with a
* replayable validation receipt. See docs/designs/hanzeep-mvp.md.
* @module dsh-plugin-hanzeep
*/
const name = "hanzeep";
const inject = ["tools", "llm"];
async function apply(ctx, config) {
	await registerTools(ctx, config, join(import.meta.dirname, "..", "packs"));
}
/**
* Pack loading is apply-time (decision #9): load failures — bad manifest,
* broken ruleset, missing Config-default language — fail loud here.
* Split from {@link apply} so the packs root is injectable for tests.
*/
async function registerTools(ctx, config, builtinRoot) {
	const packs = await loadPacks(builtinRoot, { extra: config.packsDir === void 0 || config.packsDir.length === 0 ? void 0 : [config.packsDir] });
	if (packs.size === 0) throw new Error(`hanzeep: no packs found under ${builtinRoot}`);
	if (config.defaultLanguage !== void 0 && config.defaultLanguage.length > 0) {
		const missing = [...packs.values()].filter((p) => !p.manifest.languages.includes(config.defaultLanguage ?? ""));
		if (missing.length > 0) throw new Error(`hanzeep: defaultLanguage "${config.defaultLanguage}" missing from packs: ${missing.map((p) => p.manifest.name).join(", ")} (available per pack: ${[...packs.values()].map((p) => `${p.manifest.name}=[${p.manifest.languages.join(",")}]`).join(" ")})`);
	}
	const deps = {
		packs,
		config,
		ctx
	};
	ctx.tools.register(defineDocGenerateTool(deps));
	ctx.tools.register(defineDocValidateTool(deps));
}
//#endregion
export { Config, DocService, apply, generateDocument, inject, name, registerTools, runRepairLoop };

//# sourceMappingURL=index.js.map