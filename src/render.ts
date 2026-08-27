import Handlebars from 'handlebars'

/**
 * Markdown rendering: JSON is the single source of truth; the Handlebars
 * template is the per-language presentation layer. Empty renders fail loud.
 */
export function createRenderer(template: string): (artifact: unknown) => string {
  const compiled = Handlebars.compile(template)
  return (artifact: unknown) => {
    const text = compiled(artifact)
    if (text.trim().length === 0) throw new Error('template rendered empty output')
    return text
  }
}
