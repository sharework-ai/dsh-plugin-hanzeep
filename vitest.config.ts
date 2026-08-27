import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/pack.ts'],
      // Branch threshold is 80 (not 100): the remaining branches are defensive
      // null-guards on boundaries the type system already narrows; forced tests
      // would assert tautologies. Lines/functions/statements stay at 100.
      thresholds: { lines: 100, functions: 100, branches: 80, statements: 100 },
    },
  },
})
