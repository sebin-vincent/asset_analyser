import { defineConfig } from 'vitest/config'

// Deliberately separate from vite.config.ts: the suite covers only the pure modules in
// src/utils, so there's no reason to load the react and tailwind plugins to run it.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
