import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/pack.ts'],
  dts: { temple: false },
  format: 'esm',
  platform: 'node',
  unbundle: true,
})
