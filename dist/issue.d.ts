//#region src/issue.d.ts
/** Severity levels mirroring the pack rule families (ERROR blocks green). */
type Severity = 'error' | 'warning' | 'info';
/**
 * Unified validation finding. Every checker (ajv schema, declarative rules,
 * JS function rules, internal loop errors) maps to this single shape so the
 * repair prompt, receipt, and reports consume one format.
 */
interface Issue {
  readonly ruleId: string;
  readonly severity: Severity;
  /** Dot-separated JSON path into the artifact, `$.functions[0].funcId` style. */
  readonly jsonPath: string;
  readonly message: string;
  /** Offending value excerpt; omit only when the path itself is absent. */
  readonly snapshot?: string;
  /** Actionable fix; required for ERROR rules (DX contract). */
  readonly suggestion?: string;
}
/** Stable signature of an issue for oscillation detection. */
//#endregion
export { Issue, Severity };
//# sourceMappingURL=issue.d.ts.map