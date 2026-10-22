import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  clean: true,
  sourcemap: true,
  noExternal: [/@coroinha\//],
  esbuildOptions(options) {
    options.packages = 'external'
  },
})
