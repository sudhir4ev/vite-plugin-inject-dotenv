import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { vitePluginInjectDotenv } from '../../vite-plugin-inject-dotenv/src';

export default defineConfig({
  cacheDir: '../../node_modules/.vite/sample',

  server: {
    port: 4200,
    host: 'localhost',
  },

  preview: {
    port: 4300,
    host: 'localhost',
  },

  plugins: [
    react(),
    nxViteTsPaths(),
    vitePluginInjectDotenv({
      input: 'src/env.ts',
      dir: __dirname,
      inlineGeneratedEnv: true,
      priority: 'shell',
      shellEnvMap: {
        VITE_API_URL: '___VITE_API_URL'
      }
    }) as Plugin,
  ],

  test: {
    globals: true,
    cache: { dir: '../../node_modules/.vitest' },
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
  },
});
