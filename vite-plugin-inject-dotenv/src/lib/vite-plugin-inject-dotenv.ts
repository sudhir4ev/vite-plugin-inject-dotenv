import { Plugin } from 'vite';
import MagicString from 'magic-string';
import * as fs from 'fs';
import path from 'path';
import { resolveDotEnv } from './resolveDotEnv';
import { buildPlaceholderEnvConfig } from './buildPlaceholderEnvConfig';
import { compileEnvVars } from './compileEnvVars';
import { EnvVar } from './types';

const injectableEnvVarsCache: { [key: string]: EnvVar } = {};
const injectableEnvFileCache: { [key: string]: string } = {};
const injectableEnvPlaceholder: EnvVar = {};

async function injectEnvPlaceholders(code: string, envVars: EnvVar) {
  const substituted = await compileEnvVars(code, 'process_env');
  const customEnv = `const process_env = ${JSON.stringify(envVars, null, 2)};`;
  return `${customEnv}\n\n${substituted.code}`;
}

export function vitePluginInjectDotenv(options: {
  input: string;
  injectFileName?: string;
  dir?: string;
}): Plugin {
  let outDir = '';
  let root = '';
  const cwd = options.dir || __dirname;
  const injectFileName = options.injectFileName || 'inject-env';

  return {
    name: 'vite-runtime-env',
    enforce: 'pre',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir as string;
      root = config.root as string;
    },
    config() {
      return {
        build: {
          rollupOptions: {
            output: {
              manualChunks: (id) => {

                /**
                 * force injectable env to be a separate file
                 */
                if (id.endsWith(options.input)) {
                  return injectFileName;
                }
              },
            },
          },
        },
      };
    },
    async transform(code, id) {
      /**
       * - Resolve all available .env files
       * - create placeholder env vars, for substitution later
       * - save env vars in cache for later use
       */

      if (!id.includes(options.input)) return code;
      const envConfigs = await resolveDotEnv({
        cwd,
      });
      const placeholderEnv = buildPlaceholderEnvConfig(
        envConfigs['production'].resolved
      );
      Object.entries(placeholderEnv).forEach(([key, value]) => {
        injectableEnvPlaceholder[key] = value;
      });

      const newCode = await injectEnvPlaceholders(code, placeholderEnv);

      await Promise.all(
        Object.entries(envConfigs).map(async ([envName, allConfig]) => {
          const config = allConfig.resolved;
          injectableEnvVarsCache[envName] = config;
        })
      );

      return newCode;
    },
    writeBundle() {
      /**
       * write `inject-env-**.<env>.js` for each env in output folder
       */
      Object.entries(injectableEnvFileCache).forEach(([fileName, code]) => {
        fs.writeFileSync(path.resolve(root, outDir) + '/' + fileName, code);
      });
    },
    generateBundle(_, bundle) {
      /**
       * use the compiled env file to generate code for each env.
       * i.e. placeholder values are substituted with actual vars for each env
       *
       * these code strings along with the asset name for each env are
       * saved in `injectableEnvFileCache`.
       */
      const injectableEntry = Object.entries(bundle).find((entry) => {
        const chunk: any = entry[1];
        return chunkMatchesInput(chunk, options.input);
      });
      if (!injectableEntry) return;
      const runtimeAssetName: string = injectableEntry[0];
      const chunk: any = injectableEntry[1];

      Object.entries(injectableEnvVarsCache).forEach(([envName, envConfig]) => {
        const outFileName = `${runtimeAssetName}.${envName}.js`;
        const code: string = chunk.code;
        const newCode = substituteEnvVars(code, envConfig);

        injectableEnvFileCache[outFileName] = newCode;
      });

      /**
       * replace placeholders in production build with production env vars
       */
      chunk.code = injectableEnvFileCache[`${runtimeAssetName}.production.js`];
    },
  };
}

function substituteEnvVars(code: string, placeholderEnvMap: EnvVar) {
  let newCode = new MagicString(code);
  Object.entries(placeholderEnvMap).forEach(([envKey, value]) => {
    const placeholderKey = injectableEnvPlaceholder[envKey];
    newCode = newCode.replaceAll(placeholderKey, value);
  });
  return newCode.toString();
}

function chunkMatchesInput(chunk: any, entryFile: string) {
  const moduleIds = chunk.moduleIds || [];
  if (moduleIds.length !== 1) return;
  const moduleName: string = moduleIds[0];

  return moduleName.endsWith(entryFile);
}
