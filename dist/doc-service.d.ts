import { Config } from "./config.js";
import { Issue } from "./issue.js";
import { Pack } from "./pack.js";
import { LlmPort } from "./llm-port.js";
import { Receipt } from "./receipt.js";
import { LoopResult } from "./loop.js";

//#region src/doc-service.d.ts

/**
 * Pack-scoped doc service shared by the two tools. One instance per
 * (pack, language) so schema/rule/render compilation happens once.
 */
declare class DocService {
  readonly pack: Pack;
  readonly language: string;
  private readonly schemaCheck;
  private readonly ruleEngine;
  readonly renderer: (artifact: unknown) => string;
  readonly promptTemplate: string;
  constructor(pack: Pack, language: string);
  validate(artifact: unknown): readonly Issue[];
  rulesetSnapshot(): Receipt['rulesetSnapshot'];
  rollup(issues: readonly Issue[]): Receipt['rules'];
  buildReceipt(input: {
    result: LoopResult;
    model: string;
  }): Receipt;
}
interface GenerateInput {
  readonly pack: Pack;
  readonly language: string;
  readonly materials: readonly string[];
  readonly upstream?: readonly string[] | undefined;
  readonly artifactName: string;
  readonly workspaceRoot: string;
  readonly config: Config;
  readonly llm: LlmPort;
  readonly signal?: AbortSignal | undefined;
  readonly onRound: (round: number, artifact: unknown) => void;
}
interface GenerateOutput {
  readonly artifactPath: string;
  readonly markdownPath: string;
  readonly receipt: Receipt;
}
/**
 * doc_generate core: token pre-check → closed loop → persist artifact,
 * markdown, and sidecar receipt. Exhausted loops still write the draft and
 * a red receipt (fail loud, nothing silent).
 */
declare function generateDocument(input: GenerateInput): Promise<GenerateOutput>;
//# sourceMappingURL=doc-service.d.ts.map
//#endregion
export { DocService, GenerateInput, GenerateOutput, generateDocument };
//# sourceMappingURL=doc-service.d.ts.map