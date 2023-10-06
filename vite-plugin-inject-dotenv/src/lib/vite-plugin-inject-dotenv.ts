import { Plugin } from 'vite';
import MagicString from 'magic-string';
import * as fs from 'fs';
import path from 'path';
import { resolveDotEnv } from './resolveDotEnv';
import generate from '@babel/generator';
import { valueToNode } from '@babel/types';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import { buildPlaceholderEnvConfig } from './buildPlaceholderEnvConfig';
import { EnvVar } from './types';

const injectableEnvVarsCache: { [key: string]: EnvVar } = {};
const injectableEnvFileCache: { [key: string]: string } = {};
const injectableEnvPlaceholder: EnvVar = {};

async function injectEnvVars(code: string, envVars: EnvVar) {
  const substituted = await compileEnvVars(code, 'process_env');
  const customEnv = `const process_env = ${JSON.stringify(envVars, null, 2)};`;
  return `${customEnv}\n\n${substituted.code}`;
}

async function compileEnvVars(code: string, privateEnvVarName: string) {
  const ast = parse(code, { sourceType: 'module' });

  traverse(ast, {
    MemberExpression(path) {
      try {
        // handle `import.meta.env` format
        const { node } = path;
        if (
          node.object.type === 'MetaProperty' &&
          node.object.meta.name === 'import' &&
          node.object.property.name === 'meta' &&
          node.property.type === 'Identifier' &&
          node.property.name === 'env'
        ) {
          path.replaceWithSourceString(privateEnvVarName);
        }

        // handle `process.env` format
        if (path.get('object').matchesPattern('process.env')) {
          const envKey = path.toComputedKey();
          path.replaceWith(
            valueToNode(`${privateEnvVarName}.${(envKey as any)?.value}`)
          );
        }
      } catch (e) {
        console.error(e);
      }
    },
  });

  return generate(ast, {}, '');
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

      /**
       * - build placeholder env file using rollup
       * - for each detected env
       * - build env file for each env
       * - read processed file and save contents in cache
       * - in `writeBundle` create code.<env>.js file for each env entry in cache
       */

      const newCode = await injectEnvVars(code, placeholderEnv);

      await Promise.all(
        Object.entries(envConfigs).map(async ([envName, allConfig]) => {
          const config = allConfig.resolved;
          injectableEnvVarsCache[envName] = config;
        })
      );

      return newCode;
    },
    writeBundle() {
      Object.entries(injectableEnvFileCache).forEach(([fileName, code]) => {
        fs.writeFileSync(path.resolve(root, outDir) + '/' + fileName, code);
      });
    },
    generateBundle(_, bundle) {
      const injectableEntry = Object.entries(bundle).find((entry) => {
        const chunk: any = entry[1];
        return chunkMatchesInput(chunk, options.input);
      });
      if (!injectableEntry) return;
      const [runtimeAssetName, chunk] = injectableEntry;

      Object.entries(injectableEnvVarsCache).forEach(([envName, envConfig]) => {
        const outFileName = `${runtimeAssetName}.${envName}.js`;
        const code: string = (chunk as any).code;
        const newCode = substituteEnvVars(code, envConfig);

        injectableEnvFileCache[outFileName] = newCode;
      });
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
