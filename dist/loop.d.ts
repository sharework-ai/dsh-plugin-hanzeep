import { Issue } from "./issue.js";
import { LlmPort } from "./llm-port.js";
import { ReceiptRound } from "./receipt.js";

//#region src/loop.d.ts

interface LoopOptions {
  readonly llm: LlmPort;
  readonly promptTemplate: string;
  readonly materials: readonly string[];
  readonly upstream?: readonly string[] | undefined;
  readonly maxIterations: number;
  readonly promptTokenBudget: number;
  readonly model: string;
  readonly signal?: AbortSignal | undefined;
  /** Validates the current artifact; returns issues ([] = all green). */
  validate(artifact: unknown): readonly Issue[];
}
interface LoopRoundEvent {
  readonly round: number;
  readonly promptTokens: number;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly fingerprintsMatchedPrevious: boolean;
}
interface LoopSuccess {
  readonly status: 'green';
  readonly artifact: unknown;
  readonly iterations: number;
  readonly rounds: ReceiptRound[];
  readonly events: LoopRoundEvent[];
}
interface LoopExhausted {
  readonly status: 'exhausted';
  /** Last draft kept for manual rescue; NOT an official artifact (red receipt). */
  readonly draftArtifact: unknown;
  readonly iterations: number;
  readonly rounds: ReceiptRound[];
  readonly events: LoopRoundEvent[];
  readonly unresolved: Issue[];
}
type LoopResult = LoopSuccess | LoopExhausted;
/**
 * The closed repair loop: generate → validate → repair-until-green.
 * Oscillation guard: two consecutive rounds with an unchanged issue
 * fingerprint terminate early (fix A broke B loops burn iterations for
 * nothing). Every round persists through the round event sink so a crash
 * never loses the draft.
 */
declare function runRepairLoop(options: LoopOptions, onRound: (event: LoopRoundEvent, artifact: unknown) => void): Promise<LoopResult>;
//# sourceMappingURL=loop.d.ts.map
//#endregion
export { LoopExhausted, LoopOptions, LoopResult, LoopRoundEvent, LoopSuccess, runRepairLoop };
//# sourceMappingURL=loop.d.ts.map