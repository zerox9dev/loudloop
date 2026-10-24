import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], environment: 'node', setupFiles: ['dotenv/config'] },
  resolve: { alias: { '@': path.resolve(__dirname) } },
});
