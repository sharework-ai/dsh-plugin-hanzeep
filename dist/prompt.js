//#region src/prompt.ts
/**
* Generator and repair prompt assembly. Repair prompts embed the current
* artifact plus issues grouped by jsonPath; oversized artifacts fail loud in
* the loop's budget pre-check before any model call is spent.
*/
function assembleGeneratorPrompt(options) {
	const materialsBlock = options.materials.map((m) => `<material>\n${m}\n</material>`).join("\n\n");
	const upstreamBlock = options.upstream === void 0 || options.upstream.length === 0 ? "" : `\n\n<upstream-artifacts>\n${options.upstream.join("\n\n")}\n</upstream-artifacts>`;
	return options.promptTemplate.replace("{{materials}}", materialsBlock).replace("{{upstream}}", upstreamBlock);
}
function assembleRepairPrompt(options) {
	const grouped = /* @__PURE__ */ new Map();
	for (const issue of options.issues) {
		const list = grouped.get(issue.jsonPath) ?? [];
		list.push(issue);
		grouped.set(issue.jsonPath, list);
	}
	const issueLines = [...grouped.entries()].map(([path, list]) => {
		return `  ${path}:\n${list.map((i) => `    - [${i.severity}] ${i.ruleId}: ${i.message}${i.suggestion === void 0 ? "" : `\n      fix: ${i.suggestion}`}`).join("\n")}`;
	}).join("\n");
	return [
		options.promptTemplate,
		"",
		"<previous-attempt>",
		options.originalRequest,
		"</previous-attempt>",
		"",
		"<current-artifact>",
		JSON.stringify(options.artifact, null, 2),
		"</current-artifact>",
		"",
		"<validation-issues>",
		issueLines,
		"</validation-issues>",
		"",
		"Fix ONLY the listed issues. Return the complete corrected JSON document and nothing else. Do not change parts not listed above."
	].join("\n");
}
/** Rough token estimate (chars/4) used by the loop's budget pre-check. */
function estimateTokens(text) {
	return Math.ceil(text.length / 4);
}
/** Extract the first JSON value from a model reply, tolerating code fences. */
function extractJson(text) {
	const stripped = text.replace(/```(?:json)?\n?/g, "");
	const start = stripped.indexOf("{");
	if (start < 0) throw new Error(`no JSON object found in model output (length ${text.length})`);
	for (let end = stripped.lastIndexOf("}"); end > start; end = stripped.lastIndexOf("}", end - 1)) {
		const candidate = stripped.slice(start, end + 1);
		try {
			return JSON.parse(candidate);
		} catch {
			continue;
		}
	}
	throw new Error("model output contains no parseable JSON object");
}
//#endregion
export { assembleGeneratorPrompt, assembleRepairPrompt, estimateTokens, extractJson };

//# sourceMappingURL=prompt.js.map