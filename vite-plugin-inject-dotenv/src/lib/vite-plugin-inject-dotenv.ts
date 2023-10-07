import { Plugin } from 'vite';
import MagicString from 'magic-string';
import * as fs from 'fs';
import path from 'path';
import { resolveDotEnv } from './resolveDotEnv';
import { buildPlaceholderEnvConfig } from './buildPlaceholderEnvConfig';
import { compileEnvVars } from './compileEnvVars';
import { EnvVar } from './types';
import { buildBakeEnvScript } from './buildBakeEnvScript';
import { generateEnvReplaceScript } from './generateEnvReplaceScript';

async function injectEnvPlaceholders(code: string, envVars: EnvVar) {
  const substituted = await compileEnvVars(code, 'process_env');
  const customEnv = `const process_env = ${JSON.stringify(envVars, null, 2)};`;
  return `${customEnv}\n\n${substituted.code}`;
}

export function vitePluginInjectDotenv(options: {
  input: string;
  injectFileName?: string;
  dir?: string;
  bakeEnvScriptFileName?: string;
  inlineGeneratedEnv?: boolean;
}): Plugin {
  let outDir = '';
  let root = '';
  let injectableEnvFile = '';
  const injectableEnvVarsCache: { [key: string]: EnvVar } = {};
  const injectableEnvFileCache: {
    [key: string]: {
      fileName: string;
      code: string;
    };
  } = {};
  const injectableEnvPlaceholder: EnvVar = {};

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
      const outputPath = path.resolve(root, outDir);
      const bakeScriptName = options.bakeEnvScriptFileName || 'bakeEnv.sh';
      if (options.inlineGeneratedEnv) {
        fs.writeFileSync(
          outputPath + '/' +bakeScriptName,
          buildBakeEnvScript({
            targetFile: injectableEnvFile,
            injectableEnvFileCache,
          })
        );
      } else {
        /**
         * Generate injectable env files
         */
        Object.entries(injectableEnvFileCache).forEach(
          ([envName, { fileName, code }]) => {
            fs.writeFileSync(outputPath + '/' + fileName, code);
          }
        );

        /**
         * create bake env script
         */
        fs.writeFileSync(
          outputPath + '/' + bakeScriptName,
          generateEnvReplaceScript({
            targetFile: injectableEnvFile,
            injectableEnvVarsCache,
          })
        );
      }
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
      const injectableAssetName: string = injectableEntry[0];
      const chunk: any = injectableEntry[1];

      Object.entries(injectableEnvVarsCache).forEach(([envName, envConfig]) => {
        const outFileName = `${injectableAssetName}.${envName}.js`;
        const code: string = chunk.code;
        const newCode = substituteEnvVars(
          code,
          envConfig,
          injectableEnvPlaceholder
        );

        injectableEnvFileCache[envName] = {
          fileName: outFileName,
          code: newCode,
        };
      });

      /**
       * replace placeholders in production build with production env vars
       */
      chunk.code = injectableEnvFileCache['production'].code;

      injectableEnvFile = injectableAssetName;
    },
  };
}

function substituteEnvVars(
  code: string,
  placeholderEnvMap: EnvVar,
  injectableEnvPlaceholder: EnvVar
) {
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
