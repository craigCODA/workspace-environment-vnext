import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  build: { rollupOptions: { input: {
    acceptance: fileURLToPath(new URL('./index.html', import.meta.url)),
    workspace: fileURLToPath(new URL('./workspace.html', import.meta.url)),
  } } },
});
