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

export function vitePluginInjectDotenv(options: InjectDotenvOptions): Plugin {
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

      const substituted = await compileEnvVars(code, 'process_env', {
        plugins: options.babelPlugins,
      });
      const customEnv = `const process_env = ${JSON.stringify(
        placeholderEnv,
        null,
        2
      )};`;
      const newCode = `${customEnv}\n\n${substituted.code}`;

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
          outputPath + '/' + bakeScriptName,
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

type InjectDotenvOptions = {
  /**
   * source file using env vars.
   * Supports: both `import.meta.env` and `process.env` formats
   */
  input: string;

  /**
   * name used to create the asset file for source file provided in `options.input`
   * default: 'inject-env-[hash].js'
   */
  injectFileName?: string;

  /**
   * folder containing all `.env` files
   * defaults to project root
   */
  dir?: string;

  /**
   * name of the bash script generated which can used to create custom assets for given env
   * default: `bakeEnv.sh`
   */
  bakeEnvScriptFileName?: string;

  /**
   * Inline asset files within `bakeEnv.sh`
   *
   * By default, the plugin creates separate asset files for each env.
   * These can be used post build to replace the original env asset file.
   *
   * With this option set to true, No separate asset files are generated.
   * All asset file contents for each env are placed within `bakeEnv.sh` file.
   */
  inlineGeneratedEnv?: boolean;

  /**
   * babel plugins to compile env chunk
   *
   * @example
   * vitePluginInjectDotenv({
   *   input: 'src/env.ts',
   *   babelPlugins: ['@babel/plugin-transform-typescript']
   * })
   */
  babelPlugins?: string[];
};
