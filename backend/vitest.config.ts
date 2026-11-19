import type { UserConfig } from 'vitest/config';

const config: UserConfig = {
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
};

export default config;
