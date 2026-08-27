import { BlockAssembler, createUserMessage } from "@deepseek-ai/dsh-llm";
//#region src/llm-port.ts
function createLlmPort(ctx, route) {
	const llm = ctx.llm;
	if (llm === void 0) throw new Error("hanzeep: ctx.llm is not available; inject the dsh llm plugin before hanzeep");
	return { async complete({ system, user, maxTokens, signal }) {
		const options = {
			provider: route.provider,
			model: route.model,
			system,
			messages: [createUserMessage({
				content: [{
					type: "text",
					text: user
				}],
				source: {
					kind: "plugin",
					plugin: "hanzeep"
				}
			})],
			...maxTokens === void 0 ? {} : { maxTokens },
			...signal === void 0 ? {} : { signal }
		};
		const assembler = new BlockAssembler();
		for await (const chunk of llm.stream(options)) {
			signal?.throwIfAborted();
			assembler.push(chunk);
		}
		const text = assembler.blocks().filter((b) => b.type === "text").map((b) => b.text).join("");
		if (text.length === 0) throw new Error("llm returned no text blocks");
		return text;
	} };
}
/** One bounded retry for transient adapter failures (429/network). */
async function withSingleRetry(fn) {
	try {
		return await fn();
	} catch (error) {
		if (error !== void 0 && error.name === "AbortError") throw error;
		return await fn();
	}
}
//#endregion
export { createLlmPort, withSingleRetry };

//# sourceMappingURL=llm-port.js.map