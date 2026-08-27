//#region src/issue.ts
/** Stable signature of an issue for oscillation detection. */
function issueFingerprint(issues) {
	return issues.map((i) => `${i.ruleId}|${i.jsonPath}|${i.message}`).sort().join("\n");
}
function truncateSnapshot(value, max = 80) {
	const text = typeof value === "string" ? value : JSON.stringify(value);
	if (text === void 0) return "undefined";
	return text.length > max ? `${text.slice(0, max)}…` : text;
}
//#endregion
export { issueFingerprint, truncateSnapshot };

//# sourceMappingURL=issue.js.map