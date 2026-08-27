import { truncateSnapshot } from "./issue.js";
import Ajv from "ajv";
//#region src/schema-check.ts
/**
* ajv-backed structural check. Compiler errors mean the pack's schema itself
* is broken — that is a load-time concern, so this function throws and the
* loader's caller surfaces it before any generation runs.
*/
function createSchemaCheck(schema) {
	const ajv = new Ajv({
		allErrors: true,
		strict: false
	});
	let validate;
	try {
		validate = ajv.compile(schema);
	} catch (error) {
		throw new Error(`schema does not compile: ${error.message}`);
	}
	return (artifact) => {
		if (validate(artifact)) return [];
		return (validate.errors ?? []).map((e) => ({
			ruleId: `schema/${e.keyword ?? "unknown"}`,
			severity: "error",
			jsonPath: `#${e.instancePath || "$"}`,
			message: e.message ?? "schema violation",
			snapshot: truncateSnapshot(JSON.stringify(artifact)?.slice(0, 60) ?? "undefined"),
			suggestion: `Make the value at ${e.instancePath || "the root"} satisfy "${e.keyword ?? "schema"}" — see the pack schema for the exact constraint.`
		}));
	};
}
//#endregion
export { createSchemaCheck };

//# sourceMappingURL=schema-check.js.map