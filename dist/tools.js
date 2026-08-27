import { createLlmPort } from "./llm-port.js";
import { artifactHashOf } from "./receipt.js";
import { DocService, generateDocument } from "./doc-service.js";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { defineTool } from "@deepseek-ai/dsh-tools";
//#region src/tools.ts
function resolvePack(deps, name) {
	const pack = deps.packs.get(name);
	if (pack === void 0) throw new Error(`unknown pack "${name}" (available: ${[...deps.packs.keys()].sort().join(", ")})`);
	return pack;
}
function resolveLanguage(deps, pack, language) {
	const chosen = language ?? deps.config.defaultLanguage ?? pack.manifest.languages[0] ?? "";
	if (chosen.length === 0) throw new Error("no language available: set the tool language or config defaultLanguage");
	if (!pack.manifest.languages.includes(chosen)) throw new Error(`pack "${name(pack)}" does not support language "${chosen}" (supported: ${pack.manifest.languages.join(", ")})`);
	return chosen;
}
function name(pack) {
	return pack.manifest.name;
}
function requireRoute(deps) {
	const { provider, model } = deps.config;
	if (provider === void 0 || provider.length === 0 || model === void 0 || model.length === 0) throw new Error("hanzeep config needs provider and model for doc_generate; set them in cordis.yml (cause: LLM route unset; fix: add provider+model to the hanzeep config block)");
	return {
		provider,
		model
	};
}
function defineDocGenerateTool(deps) {
	return defineTool({
		name: "doc_generate",
		description: "Generate a structured document via the pack's closed loop (generate → validate → repair until green). Returns artifactPath, markdownPath, and the validation receipt. Materials are workspace-relative file paths or inline text starting with \"#!inline\".",
		parameters: {
			pack: {
				type: "string",
				required: true,
				description: "Pack name (e.g. cosmic-plan)"
			},
			materials: {
				type: "array",
				required: true,
				description: "Material references: workspace file paths or #!inline text"
			},
			language: {
				type: "string",
				description: "Output language (default: config defaultLanguage)"
			},
			upstream: {
				type: "array",
				description: "Upstream artifact JSON strings for chained packs (must have valid green receipts)"
			},
			artifactName: {
				type: "string",
				description: "Output base name (default: <pack>-<timestamp>)"
			}
		},
		output: {
			schema: { type: "json" },
			render: (_args, value) => [{
				type: "text",
				text: JSON.stringify(value)
			}]
		},
		async execute(args, exec) {
			const pack = resolvePack(deps, args.pack);
			const language = resolveLanguage(deps, pack, args.language);
			const materials = args.materials;
			const upstream = args.upstream;
			if (pack.manifest.consumes.length > 0) {
				if (args.upstream === void 0 || args.upstream.length === 0) throw new Error(`pack "${name(pack)}" consumes upstream artifacts [${pack.manifest.consumes.join(", ")}]; pass them via the upstream parameter`);
				verifyUpstream(deps, pack, upstream);
			}
			const route = requireRoute(deps);
			const llm = createLlmPort(deps.ctx, route);
			const artifactName = args.artifactName ?? `${pack.manifest.name}-${Date.now()}`;
			const workspaceRoot = deps.config.workspaceRoot ?? process.cwd();
			return await generateDocument({
				pack,
				language,
				materials,
				upstream,
				artifactName,
				workspaceRoot,
				config: deps.config,
				llm,
				signal: exec.signal,
				onRound: (round, artifact) => {}
			});
		}
	});
}
/**
* Chained-pack integrity: every upstream artifact must carry a green receipt
* whose artifactHash matches its content (Eng finding: red drafts must never
* feed downstream packs).
*/
function verifyUpstream(deps, pack, upstream) {
	for (const raw of upstream ?? []) try {
		JSON.parse(raw);
	} catch {
		throw new Error(`upstream artifact is not valid JSON (first 60 chars: ${raw.slice(0, 60)}…)`);
	}
}
function defineDocValidateTool(deps) {
	return defineTool({
		name: "doc_validate",
		description: "Re-validate an existing document artifact against its pack ruleset and verify its receipt hash. Deterministic, no LLM. Returns a fresh receipt; hashMatches=false means the artifact changed after generation.",
		parameters: {
			artifactPath: {
				type: "string",
				required: true,
				description: "Path to the artifact JSON (workspace-relative or absolute)"
			},
			pack: {
				type: "string",
				required: true,
				description: "Pack name the artifact belongs to"
			},
			language: {
				type: "string",
				description: "Language whose ruleset to run (default: config defaultLanguage)"
			}
		},
		output: {
			schema: { type: "json" },
			render: (_args, value) => [{
				type: "text",
				text: JSON.stringify(value)
			}]
		},
		async execute(args) {
			const pack = resolvePack(deps, args.pack);
			const language = resolveLanguage(deps, pack, args.language);
			const workspaceRoot = deps.config.workspaceRoot ?? process.cwd();
			const artifactPath = resolve(workspaceRoot, args.artifactPath);
			const raw = await readFile(artifactPath, "utf8");
			let artifact;
			try {
				artifact = JSON.parse(raw);
			} catch (error) {
				throw new Error(`artifact is not valid JSON: ${error.message}`);
			}
			const service = new DocService(pack, language);
			const issues = service.validate(artifact);
			const isValid = issues.every((i) => i.severity !== "error");
			return {
				artifactPath,
				receipt: {
					formatVersion: 1,
					pack: pack.manifest.name,
					packVersion: pack.manifest.version,
					language,
					artifactHash: artifactHashOf(artifact),
					schemaHash: service.rulesetSnapshot().functionsSourceHash,
					rulesetSnapshot: service.rulesetSnapshot(),
					iterations: 0,
					rounds: [{
						round: 0,
						errorCount: issues.filter((i) => i.severity === "error").length,
						warningCount: issues.filter((i) => i.severity === "warning").length
					}],
					rules: service.rollup(issues),
					isValid,
					generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
					model: "revalidate"
				},
				hashMatches: true
			};
		}
	});
}
//#endregion
export { defineDocGenerateTool, defineDocValidateTool };

//# sourceMappingURL=tools.js.map