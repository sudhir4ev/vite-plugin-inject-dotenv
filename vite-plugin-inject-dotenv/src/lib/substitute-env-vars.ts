import { EnvVar } from "./types";
import MagicString from "magic-string";

export function substituteEnvVars(
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
