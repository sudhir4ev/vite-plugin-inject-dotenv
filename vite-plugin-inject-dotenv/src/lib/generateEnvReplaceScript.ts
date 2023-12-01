import { EnvVar } from './types';

export function generateEnvReplaceScript(options: {
  targetFile: string;
  injectableEnvVarsCache: { [key: string]: EnvVar };
}) {
  const { injectableEnvVarsCache, targetFile } = options;
  const envKeys = Object.keys(injectableEnvVarsCache);
  return `#! /bin/bash

TARGET_ENV=$1

if [[ ${envKeys.map((envKey) => '$TARGET_ENV == "' + envKey + '"').join(' || ')} ]]; then
  echo "Creating '$TARGET_ENV'" package ${targetFile}
else
  echo "Selected env '$TARGET_ENV' not found"
  echo "  available env: ${Object.keys(injectableEnvVarsCache)
    .map((fileName) => `'${fileName}'`)
    .join(', ')}"
  exit 1
fi

srcFile=${targetFile}.$TARGET_ENV.js
dstFile=${targetFile}

cp $srcFile $dstFile
 `;
}
