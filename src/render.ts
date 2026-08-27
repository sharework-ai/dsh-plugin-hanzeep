import Handlebars from 'handlebars'

/**
 * Markdown rendering: JSON is the single source of truth; the Handlebars
 * template is the per-language presentation layer. Empty renders fail loud.
 */
export function createRenderer(template: string, label = 'template'): (artifact: unknown) => string {
  const compiled = Handlebars.compile(template)
  return (artifact: unknown) => {
    const text = compiled(artifact)
    if (text.trim().length === 0) throw new Error(`${label} rendered empty output; check the template placeholders against the artifact shape`)
    return text
  }
}
