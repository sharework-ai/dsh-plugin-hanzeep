import { createHash } from "node:crypto";
//#region src/receipt.ts
function sha256(text) {
	return createHash("sha256").update(text).digest("hex");
}
/** Canonical JSON hashing: sorted keys, no whitespace. */
function canonicalJson(value) {
	return JSON.stringify(sortKeys(value));
}
function sortKeys(value) {
	if (Array.isArray(value)) return value.map(sortKeys);
	if (typeof value === "object" && value !== null) return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, sortKeys(v)]));
	return value;
}
function artifactHashOf(artifact) {
	return sha256(canonicalJson(artifact));
}
//#endregion
export { artifactHashOf, canonicalJson, sha256 };

//# sourceMappingURL=receipt.js.map