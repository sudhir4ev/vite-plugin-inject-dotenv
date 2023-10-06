import { EnvVar } from './types';

export function buildPlaceholderEnvConfig(exampleEnvConfig: EnvVar) {
  return Object.keys(exampleEnvConfig).reduce((res, key) => {
    res[key] = `$${key}$`;
    return res;
  }, {} as EnvVar);
}
