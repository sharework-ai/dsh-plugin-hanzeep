import { assembleGeneratorPrompt, estimateTokens } from "./prompt.js";
import { runRepairLoop } from "./loop.js";
import { createRuleEngine, rollupRules } from "./rule-engine.js";
import { readMaterials } from "./materials.js";
import { createSchemaCheck } from "./schema-check.js";
import { artifactHashOf, sha256 } from "./receipt.js";
import { createRenderer } from "./render.js";
import { dirname, join, resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
//#region src/doc-service.ts
/**
* Pack-scoped doc service shared by the two tools. One instance per
* (pack, language) so schema/rule/render compilation happens once.
*/
var DocService = class {
	pack;
	language;
	schemaCheck;
	ruleEngine;
	renderer;
	promptTemplate;
	constructor(pack, language) {
		this.pack = pack;
		this.language = language;
		if (!pack.manifest.languages.includes(language)) throw new Error(`pack "${pack.manifest.name}" does not support language "${language}" (supported: ${pack.manifest.languages.join(", ")})`);
		this.promptTemplate = pack.prompts.get(language) ?? "";
		this.schemaCheck = createSchemaCheck(pack.schema);
		this.ruleEngine = createRuleEngine(pack, language);
		this.renderer = createRenderer(pack.templates.get(language) ?? "");
	}
	validate(artifact) {
		return [...this.schemaCheck(artifact), ...this.ruleEngine(artifact)];
	}
	rulesetSnapshot() {
		return {
			declarative: this.pack.rules.get(this.language) ?? [],
			functionsSourceHash: sha256(JSON.stringify(this.pack.functionRules.map((r) => ({
				id: r.id,
				suggestion: r.suggestion
			}))))
		};
	}
	rollup(issues) {
		return rollupRules(this.pack, this.language, issues);
	}
	buildReceipt(input) {
		const artifact = input.result.status === "green" ? input.result.artifact : input.result.draftArtifact;
		const isValid = input.result.status === "green";
		const finalIssues = isValid ? [] : input.result.unresolved;
		return {
			formatVersion: 1,
			pack: this.pack.manifest.name,
			packVersion: this.pack.manifest.version,
			language: this.language,
			artifactHash: artifactHashOf(artifact),
			schemaHash: sha256(JSON.stringify(this.pack.schema)),
			rulesetSnapshot: this.rulesetSnapshot(),
			iterations: input.result.iterations,
			rounds: input.result.rounds,
			rules: this.rollup(finalIssues),
			isValid,
			generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
			model: input.model
		};
	}
};
/**
* doc_generate core: token pre-check → closed loop → persist artifact,
* markdown, and sidecar receipt. Exhausted loops still write the draft and
* a red receipt (fail loud, nothing silent).
*/
async function generateDocument(input) {
	const service = new DocService(input.pack, input.language);
	const materialTexts = await readMaterials(input.materials, input.workspaceRoot);
	const firstPrompt = assembleGeneratorPrompt({
		promptTemplate: service.promptTemplate,
		materials: materialTexts,
		upstream: input.upstream
	});
	const budget = estimateTokens(firstPrompt);
	const tokenBudget = input.config.promptTokenBudget ?? 6e4;
	if (budget > tokenBudget) throw new Error(`generator prompt exceeds token budget (${budget} > ${tokenBudget}); reduce materials or raise promptTokenBudget`);
	const result = await runRepairLoop({
		llm: input.llm,
		promptTemplate: service.promptTemplate,
		materials: materialTexts,
		upstream: input.upstream,
		maxIterations: input.config.maxIterations ?? 5,
		promptTokenBudget: tokenBudget,
		model: input.config.model ?? "unknown",
		signal: input.signal,
		validate: (artifact) => service.validate(artifact)
	}, (event, artifact) => input.onRound(event.round, artifact));
	const model = input.config.model ?? "unknown";
	const receipt = service.buildReceipt({
		result,
		model
	});
	const artifact = result.status === "green" ? result.artifact : result.draftArtifact;
	const outDir = resolve(input.workspaceRoot, "output");
	await mkdir(outDir, { recursive: true });
	const artifactPath = join(outDir, `${input.artifactName}.json`);
	const receiptPath = join(outDir, `${input.artifactName}.receipt.json`);
	const markdownPath = join(outDir, `${input.artifactName}.md`);
	await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
	await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
	const markdown = service.renderer(artifact);
	await writeFile(markdownPath, markdown, "utf8");
	dirname(receiptPath);
	if (result.status === "exhausted") throw new Error(`doc_generate exhausted after ${result.iterations} iterations without going green; draft + red receipt kept at ${artifactPath}. Unresolved: ${result.unresolved.slice(0, 5).map((i) => i.ruleId).join(", ")}${result.unresolved.length > 5 ? "…" : ""}`);
	return {
		artifactPath,
		markdownPath,
		receipt
	};
}
//#endregion
export { DocService, generateDocument };

//# sourceMappingURL=doc-service.js.map