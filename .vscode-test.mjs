import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/integration/**/*.test.js',
  // Pin a known-good stable build so CI doesn't break when the newest stable
  // archive has been published in the update API before the binary mirrors are ready.
  version: '1.111.0',
  mocha: {
    timeout: 20000,
  },
});
