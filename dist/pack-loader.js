import "./issue.js";
import { join } from "node:path";
import { readFile, readdir } from "node:fs/promises";
//#region src/pack-loader.ts
function assertManifest(raw, dir) {
	if (typeof raw !== "object" || raw === null) throw new Error(`pack ${dir}: manifest.json must be an object`);
	const m = raw;
	if (typeof m.name !== "string" || m.name.length === 0) throw new Error(`pack ${dir}: manifest.name must be a non-empty string`);
	if (typeof m.version !== "string" || m.version.length === 0) throw new Error(`pack ${dir}: manifest.version must be a non-empty string`);
	if (!Array.isArray(m.languages) || m.languages.length === 0) throw new Error(`pack ${dir}: manifest.languages must be a non-empty array`);
	if (m.languages.some((l) => typeof l !== "string" || l.length === 0)) throw new Error(`pack ${dir}: manifest.languages entries must be non-empty strings`);
	if (m.consumes !== void 0 && !Array.isArray(m.consumes)) throw new Error(`pack ${dir}: manifest.consumes must be an array when present`);
	return {
		name: m.name,
		version: m.version,
		consumes: m.consumes ?? [],
		languages: m.languages
	};
}
function assertRule(raw, dir, i) {
	if (typeof raw !== "object" || raw === null) throw new Error(`pack ${dir}: rules[${i}] must be an object`);
	const r = raw;
	const base = {
		id: r.id,
		severity: r.severity,
		given: r.given,
		field: r.field,
		suggestion: r.suggestion
	};
	for (const [k, v] of Object.entries(base)) if (typeof v !== "string" || v.length === 0) throw new Error(`pack ${dir}: rules[${i}].${k} must be a non-empty string`);
	if (![
		"minLength",
		"maxLength",
		"forbiddenKeywords",
		"pattern"
	].includes(String(r.kind))) throw new Error(`pack ${dir}: rules[${i}].kind must be one of minLength|maxLength|forbiddenKeywords|pattern`);
	return r;
}
/** Function-rule modules authored by pack maintainers; validated on load. */
async function loadFunctionRules(dir, manifest) {
	const rulesPath = join(dir, "rules", "functions.js");
	let mod;
	try {
		mod = await import(rulesPath);
	} catch {
		return [];
	}
	const exported = mod.rules;
	if (exported === void 0) throw new Error(`pack ${dir}: rules/functions.js must export a \`rules\` array`);
	if (!Array.isArray(exported)) throw new Error(`pack ${dir}: rules/functions.js \`rules\` must be an array`);
	return exported.map((raw, i) => {
		const r = raw;
		if (typeof r.id !== "string" || r.id.length === 0) throw new Error(`pack ${dir}: functions.rules[${i}].id must be a non-empty string`);
		if (typeof r.suggestion !== "string" || r.suggestion.length === 0) throw new Error(`pack ${dir}: functions.rules[${i}] must carry a suggestion`);
		if (typeof r.check !== "function") throw new Error(`pack ${dir}: functions.rules[${i}].check must be a function`);
		if (!manifest.languages.includes("") && r.severity !== void 0 && ![
			"error",
			"warning",
			"info"
		].includes(r.severity)) throw new Error(`pack ${dir}: functions.rules[${i}].severity must be error|warning|info`);
		return {
			...r,
			severity: r.severity ?? "error"
		};
	});
}
async function loadOnePack(dir) {
	const manifest = assertManifest(JSON.parse(await readFile(join(dir, "manifest.json"), "utf8")), dir);
	const schema = JSON.parse(await readFile(join(dir, "schema.json"), "utf8"));
	const rules = /* @__PURE__ */ new Map();
	const prompts = /* @__PURE__ */ new Map();
	const templates = /* @__PURE__ */ new Map();
	for (const lang of manifest.languages) {
		const rawRules = JSON.parse(await readFile(join(dir, "rules", `${lang}.json`), "utf8"));
		if (!Array.isArray(rawRules)) throw new Error(`pack ${dir}: rules/${lang}.json must be an array`);
		rules.set(lang, rawRules.map((r, i) => assertRule(r, dir, i)));
		prompts.set(lang, await readFile(join(dir, "prompts", `${lang}.md`), "utf8"));
		templates.set(lang, await readFile(join(dir, "templates", `${lang}.hbs`), "utf8"));
	}
	const goldenSample = JSON.parse(await readFile(join(dir, "samples", "golden.json"), "utf8"));
	return {
		manifest,
		schema,
		rules,
		functionRules: await loadFunctionRules(dir, manifest),
		prompts,
		templates,
		goldenSample,
		dir
	};
}
async function listPackRoots(root) {
	try {
		return (await readdir(root, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => join(root, e.name));
	} catch {
		return [];
	}
}
/**
* Load built-in packs then `packsDir` overrides. Same-name later entries win
* (Config over built-in); failures inside a directory fail loud (ruleset
* syntax belongs to load time, decision #11).
*/
async function loadPacks(builtinRoot, dirs) {
	const roots = [builtinRoot, ...dirs.extra ?? []];
	const packs = /* @__PURE__ */ new Map();
	for (const root of roots) for (const dir of await listPackRoots(root)) {
		const pack = await loadOnePack(dir);
		packs.set(pack.manifest.name, pack);
	}
	return packs;
}
//#endregion
export { loadPacks };

//# sourceMappingURL=pack-loader.js.map