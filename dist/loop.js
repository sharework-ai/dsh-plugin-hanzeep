import { issueFingerprint } from "./issue.js";
import { withSingleRetry } from "./llm-port.js";
import { assembleGeneratorPrompt, assembleRepairPrompt, estimateTokens, extractJson } from "./prompt.js";
//#region src/loop.ts
/** Loop-internal issue rule ids; ride the same repair path as pack rules. */
const INTERNAL_INVALID_OUTPUT = "internal/invalid-output";
const INTERNAL_LLM_ERROR = "internal/llm-error";
function severityCounts(issues) {
	let errors = 0;
	let warnings = 0;
	for (const i of issues) if (i.severity === "error") errors++;
	else if (i.severity === "warning") warnings++;
	return {
		errors,
		warnings
	};
}
/**
* The closed repair loop: generate → validate → repair-until-green.
* Oscillation guard: two consecutive rounds with an unchanged issue
* fingerprint terminate early (fix A broke B loops burn iterations for
* nothing). Every round persists through the round event sink so a crash
* never loses the draft.
*/
async function runRepairLoop(options, onRound) {
	const rounds = [];
	const events = [];
	let previousFingerprint = "";
	let repeatedCount = 0;
	let artifact;
	let request = assembleGeneratorPrompt({
		promptTemplate: options.promptTemplate,
		materials: options.materials,
		upstream: options.upstream
	});
	let iterations = 0;
	while (iterations < options.maxIterations) {
		const budget = estimateTokens(request) + estimateTokens(JSON.stringify(artifact ?? ""));
		if (budget > options.promptTokenBudget) throw new Error(`repair prompt exceeds token budget (${budget} > ${options.promptTokenBudget}); partition the materials or raise promptTokenBudget in config`);
		options.signal?.throwIfAborted();
		iterations++;
		let text;
		try {
			text = await withSingleRetry(() => options.llm.complete({
				system: "",
				user: request,
				signal: options.signal
			}));
		} catch (error) {
			if (error.name === "AbortError") throw error;
			const llmIssues = [{
				ruleId: INTERNAL_LLM_ERROR,
				severity: "error",
				jsonPath: "$",
				message: `model call failed: ${error.message}`,
				suggestion: "Retry the doc_generate call; if it persists, check provider config (provider/model) and network."
			}];
			const counts = severityCounts(llmIssues);
			const ev = {
				round: iterations,
				promptTokens: budget,
				errorCount: counts.errors,
				warningCount: counts.warnings,
				fingerprintsMatchedPrevious: false
			};
			events.push(ev);
			rounds.push({
				round: iterations,
				errorCount: counts.errors,
				warningCount: counts.warnings
			});
			onRound(ev, artifact ?? null);
			return {
				status: "exhausted",
				draftArtifact: artifact ?? null,
				iterations,
				rounds,
				events,
				unresolved: llmIssues
			};
		}
		let parseIssue;
		try {
			artifact = extractJson(text);
		} catch (error) {
			parseIssue = {
				ruleId: INTERNAL_INVALID_OUTPUT,
				severity: "error",
				jsonPath: "$",
				message: error.message,
				suggestion: "Return the complete JSON document as the entire reply, no prose around it."
			};
			artifact = artifact ?? null;
		}
		const issues = parseIssue === void 0 ? options.validate(artifact) : [parseIssue];
		const counts = severityCounts(issues);
		const fingerprint = issueFingerprint(issues);
		const repeated = fingerprint === previousFingerprint;
		repeatedCount = repeated ? repeatedCount + 1 : 0;
		previousFingerprint = fingerprint;
		const ev = {
			round: iterations,
			promptTokens: budget,
			errorCount: counts.errors,
			warningCount: counts.warnings,
			fingerprintsMatchedPrevious: repeated
		};
		events.push(ev);
		rounds.push({
			round: iterations,
			errorCount: counts.errors,
			warningCount: counts.warnings
		});
		onRound(ev, artifact);
		if (counts.errors === 0) return {
			status: "green",
			artifact,
			iterations,
			rounds,
			events
		};
		if (repeatedCount >= 1) return {
			status: "exhausted",
			draftArtifact: artifact,
			iterations,
			rounds,
			events,
			unresolved: [...issues]
		};
		request = assembleRepairPrompt({
			promptTemplate: options.promptTemplate,
			originalRequest: assembleGeneratorPrompt({
				promptTemplate: options.promptTemplate,
				materials: options.materials,
				upstream: options.upstream
			}),
			artifact,
			issues
		});
	}
	return {
		status: "exhausted",
		draftArtifact: artifact ?? null,
		iterations,
		rounds,
		events,
		unresolved: [...options.validate(artifact ?? null)]
	};
}
//#endregion
export { INTERNAL_INVALID_OUTPUT, INTERNAL_LLM_ERROR, runRepairLoop };

//# sourceMappingURL=loop.js.map