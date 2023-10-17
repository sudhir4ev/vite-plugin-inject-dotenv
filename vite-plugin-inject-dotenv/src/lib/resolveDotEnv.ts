import { type Dirent } from 'fs';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as lodash from 'lodash';

export async function resolveDotEnv(options: ResolveDotEnvOptions) {
  const allEntries = fs.readdirSync(options.cwd, {
    withFileTypes: true,
  });
  const envFiles = allEntries.filter((dirEntry) => {
    return (
      dirEntry.isFile() &&
      isDotEnvFile(dirEntry.name) &&

      // ignore example env file
      dirEntry.name !== '.env.example'
    );
  });

  return getEnvConfigs(envFiles, options.cwd);
}

type ResolveDotEnvOptions = {
  cwd: string;
};

function isDotEnvFile(fileName: string) {
  return fileName.match(/^\.env/g);
}

function getEnvConfigs(dirents: Dirent[], cwd: string) {
  const envConfigs = {} as {
    [key: string]: {
      actual: { [key: string]: string };
      local?: { [key: string]: string };
      resolved: { [key: string]: string };
    };
  };
  const fileNames = dirents.map((dirEnt) => dirEnt.name);
  const envGroups = lodash.groupBy(fileNames, (fileName: string) => {
    return fileName.trim().split('.').at(2) || 'default';
  });

  Object.entries(envGroups).forEach(([envName, envFileNames]) => {
    let envFileName: string | undefined;
    let localEnvFileName: string | undefined;
    if (envName === 'default') {
      envFileName = '.env';
      localEnvFileName = '.env.local';
    } else {
      envFileName = envFileNames.find(
        (fileName) => fileName === `.env.${envName}`
      );
      localEnvFileName = envFileNames.find(
        (fileName) => fileName === `.env.${envName}.local`
      );
    }
    if (!envFileName) {
      throw new Error(`env file \`${envFileName}\` not found`);
    }
    envConfigs[envName] = {
      actual: resolveEnv(path.resolve(cwd, envFileName)),
      resolved: {},
    };
    if (
      localEnvFileName &&
      fs.existsSync(path.resolve(cwd, localEnvFileName))
    ) {
      envConfigs[envName].local = resolveEnv(
        path.resolve(cwd, localEnvFileName)
      );
    }

    for (const envName in envConfigs) {
      envConfigs[envName].resolved = {
        ...envConfigs[envName].actual,
        ...envConfigs[envName].local,
      };
    }
  });

  return envConfigs;
}

function resolveEnv(filePath: string) {
  try {
    const fileString = fs.readFileSync(path.resolve(filePath)).toString();
    return dotenv.parse(fileString);
  } catch (e) {
    return {};
  }
}
