import { truncateSnapshot } from "./issue.js";
//#region src/rule-engine.ts
/**
* Mini rule engine (bake-off winner over @stoplight/spectral-core; see
* docs/designs/hanzeep-mvp.md Approach A: probe found CJS-only packaging and
* custom-function wiring friction; every COSMIC rule family maps here in
* ~100 lines). Runs declarative rules then function rules over the artifact.
*/
function scopeFor(artifact, given) {
	const arrayMatch = /^\$\.([A-Za-z0-9_]+)\[\*\]$/.exec(given);
	if (arrayMatch === null) {
		if (given !== "$") throw new Error(`rule given path not supported: ${given} (supported: $, $.field[*])`);
		return {
			items: [artifact],
			parent: artifact
		};
	}
	const key = arrayMatch[1] ?? "";
	const value = artifact?.[key];
	if (!Array.isArray(value)) return {
		items: [],
		parent: artifact
	};
	return {
		items: value,
		parent: value
	};
}
function checkField(rule, item, index) {
	const value = item?.[rule.field];
	const jsonPath = `$.${rule.given === "$" ? "" : `${rule.given.slice(2)}.`}${rule.field}`.replace("..", ".");
	const at = rule.given === "$" ? jsonPath : `${rule.given.slice(0, -3)}[${index}].${rule.field}`;
	const snapshot = truncateSnapshot(value);
	switch (rule.kind) {
		case "minLength": {
			const len = typeof value === "string" ? value.length : -1;
			return len >= rule.min ? void 0 : {
				ruleId: rule.id,
				severity: rule.severity,
				jsonPath: at,
				message: `length ${len} < min ${rule.min}`,
				...snapshot === void 0 ? {} : { snapshot },
				suggestion: rule.suggestion
			};
		}
		case "maxLength": {
			const len = typeof value === "string" ? value.length : Number.POSITIVE_INFINITY;
			return len <= rule.max ? void 0 : {
				ruleId: rule.id,
				severity: rule.severity,
				jsonPath: at,
				message: `length ${len} > max ${rule.max}`,
				...snapshot === void 0 ? {} : { snapshot },
				suggestion: rule.suggestion
			};
		}
		case "forbiddenKeywords": {
			const text = typeof value === "string" ? value : "";
			const hit = rule.keywords.find((k) => text.includes(k));
			return hit === void 0 ? void 0 : {
				ruleId: rule.id,
				severity: rule.severity,
				jsonPath: at,
				message: `forbidden keyword "${hit}"`,
				...snapshot === void 0 ? {} : { snapshot },
				suggestion: rule.suggestion
			};
		}
		case "pattern": {
			const text = typeof value === "string" ? value : "";
			let re;
			try {
				re = new RegExp(rule.pattern);
			} catch (error) {
				throw new Error(`rule ${rule.id}: invalid pattern "${rule.pattern}": ${error.message}`);
			}
			return re.test(text) === rule.mustMatch ? void 0 : {
				ruleId: rule.id,
				severity: rule.severity,
				jsonPath: at,
				message: `pattern "${rule.pattern}" ${rule.mustMatch ? "not matched" : "matched (forbidden)"}`,
				...snapshot === void 0 ? {} : { snapshot },
				suggestion: rule.suggestion
			};
		}
	}
}
function createRuleEngine(pack, language) {
	const declarative = pack.rules.get(language);
	if (declarative === void 0) throw new Error(`pack ${pack.manifest.name} has no rules for language "${language}"`);
	const fnRules = pack.functionRules;
	return (artifact) => {
		const issues = [];
		for (const rule of declarative) {
			const { items } = scopeFor(artifact, rule.given);
			items.forEach((item, index) => {
				const issue = checkField(rule, item, index);
				if (issue !== void 0) issues.push(issue);
			});
		}
		for (const rule of fnRules) try {
			for (const found of rule.check(artifact)) issues.push({
				ruleId: rule.id,
				severity: rule.severity,
				jsonPath: found.jsonPath,
				message: found.message,
				...found.snapshot === void 0 ? {} : { snapshot: found.snapshot },
				suggestion: rule.suggestion
			});
		} catch (error) {
			throw new Error(`rule ${rule.id} crashed: ${error.message}`);
		}
		return issues;
	};
}
/** Issue set → per-rule pass/fail rollup for receipts. */
function rollupRules(pack, language, issues) {
	const failed = /* @__PURE__ */ new Map();
	for (const i of issues) failed.set(i.ruleId, (failed.get(i.ruleId) ?? 0) + 1);
	return [.../* @__PURE__ */ new Set([
		...(pack.rules.get(language) ?? []).map((r) => r.id),
		...pack.functionRules.map((r) => r.id),
		"schema/*"
	])].sort().map((ruleId) => ({
		ruleId,
		severity: ruleId === "schema/*" ? "error" : "error",
		status: failed.has(ruleId) ? "fail" : "pass",
		count: failed.get(ruleId) ?? 0
	}));
}
//#endregion
export { createRuleEngine, rollupRules };

//# sourceMappingURL=rule-engine.js.map