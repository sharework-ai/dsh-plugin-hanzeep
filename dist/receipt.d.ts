//#region src/receipt.d.ts
/**
 * Sidecar validation receipt (`<artifact>.receipt.json`): the all-green state
 * as a portable artifact. Tamper-EVIDENT, not tamper-proof (no signature):
 * `doc_validate` re-hashes the artifact and re-runs the embedded ruleset
 * snapshot, so accidental edits go red; a determined attacker can forge both.
 */
/** JSON value used inside receipt snapshots. */
type Json = string | number | boolean | null | Json[] | {
  [key: string]: Json;
};
type ReceiptRound = {
  readonly round: number;
  readonly errorCount: number;
  readonly warningCount: number;
};
type ReceiptRuleResult = {
  readonly ruleId: string;
  readonly severity: string;
  readonly status: 'pass' | 'fail';
  readonly count: number;
};
type Receipt = {
  readonly formatVersion: number;
  readonly pack: string;
  readonly packVersion: string;
  readonly language: string;
  readonly artifactHash: string;
  readonly schemaHash: string;
  /** Declarative rules JSON as-run; function rules contribute their source hash. */
  readonly rulesetSnapshot: {
    readonly declarative: Record<string, Json>[];
    readonly functionsSourceHash: string;
  };
  readonly iterations: number;
  readonly rounds: ReceiptRound[];
  readonly rules: ReceiptRuleResult[];
  readonly isValid: boolean;
  readonly generatedAt: string;
  readonly model: string;
};
//#endregion
export { Json, Receipt, ReceiptRound, ReceiptRuleResult };
//# sourceMappingURL=receipt.d.ts.map