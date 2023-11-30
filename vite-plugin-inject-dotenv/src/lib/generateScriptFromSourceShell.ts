import { EnvVar } from "./types";

export function generateScriptFromSourceShell(options: {
  targetFile: string;
  placeholderEnv: EnvVar,
  shellEnvMap?: {
    [shellVariable: string]: string;
  };
  shellCodeTemplateFile: string;
}) {
  const { targetFile, shellCodeTemplateFile } = options;

  const sanitizedShellEnvMap = Object.entries(
    options.shellEnvMap || {}
  ).reduce((acc, entry) => {
    const [envVarName, shellVarName] = entry;
    acc[envVarName] = `$${shellVarName}`;
    return acc;
  }, {} as EnvVar);

  const defaultEnvSubstPlaceholders = Object.keys(
    options.placeholderEnv
  ).reduce((acc, key) => {
    acc[key] = `$${key}`;
    return acc;
  }, {} as EnvVar);

  const shellEnvMap = {
    ...defaultEnvSubstPlaceholders,
    ...sanitizedShellEnvMap,
  };

  const envsubstArgs = Object.values(shellEnvMap)
    .map((shellEnvVar) => {
      return `\\${shellEnvVar}`;
    })
    .join(`,`);

  return `#! /bin/bash

# chunk file for env variables

# Substitute env variables with values to a temp file
envsubst ${envsubstArgs} < ${shellCodeTemplateFile} >/tmp/env.js.temp

# Move the temp file to actual main.js path
mv /tmp/env.js.temp ${targetFile}
 `;
}
