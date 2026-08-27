import z from "@deepseek-ai/schemastery";
//#region src/config.ts
const Config = z.object({
	packsDir: z.string(),
	workspaceRoot: z.string(),
	defaultLanguage: z.string(),
	maxIterations: z.number().default(5),
	promptTokenBudget: z.number().default(6e4),
	provider: z.string(),
	model: z.string()
});
//#endregion
export { Config };

//# sourceMappingURL=config.js.map