import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.mjs'],
    setupFiles: ['./tests/setup.mjs'],
    // Controllers hold module-level state (the lazy Razorpay client), so each
    // test file gets a clean module registry.
    isolate: true,
  },
});
