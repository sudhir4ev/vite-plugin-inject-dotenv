export function generateScriptFromSourceDotenv(options: {
  targetFile: string;
  injectableEnvFileCache: {
    [key: string]: {
      fileName: string;
      code: string;
    };
  };
}) {
  const { injectableEnvFileCache, targetFile } = options;
  const envKeys = Object.keys(injectableEnvFileCache);

  const envIfBlocks = envKeys.map((envKey) => {
    const { code } = injectableEnvFileCache[envKey];
    return `
if [[ $TARGET_ENV == "${envKey}" ]]; then
  echo "Creating $TARGET_ENV"...
  echo '${code}' > ${targetFile}
  exit 0
fi`;
  }).join(`
`);

  return `#! /bin/bash

TARGET_ENV=$1

if [[ ${envKeys
    .map((envKey) => '$TARGET_ENV != "' + envKey + '"')
    .join(' && ')} ]]; then
  echo Selected env "$TARGET_ENV" not found
  echo "  available env: ${envKeys.map((fileName) => `${fileName}`).join(', ')}"
  exit 1
fi

${envIfBlocks}

 `;
}
