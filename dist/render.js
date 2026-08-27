import Handlebars from "handlebars";
//#region src/render.ts
/**
* Markdown rendering: JSON is the single source of truth; the Handlebars
* template is the per-language presentation layer. Empty renders fail loud.
*/
function createRenderer(template) {
	const compiled = Handlebars.compile(template);
	return (artifact) => {
		const text = compiled(artifact);
		if (text.trim().length === 0) throw new Error("template rendered empty output");
		return text;
	};
}
//#endregion
export { createRenderer };

//# sourceMappingURL=render.js.map