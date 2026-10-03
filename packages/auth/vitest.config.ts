import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // bcrypt at cost factor 12 makes repeated-login-failure tests (10+ attempts per test)
    // genuinely slow — observed up to ~12s under full-workspace parallel load, well past
    // Vitest's 5000ms default. This is real bcrypt cost, not a hang.
    testTimeout: 20_000,
  },
});
