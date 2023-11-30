# vite-plugin-inject-dotenv

Enables env variables substitution into your asset bundle. 
The substitution is done by a shell script which is generated as part of
the build artefact.

> Requirement: The script uses `.env.example` file as source of truth for
which variables should be tracked for substitution.

## Sample usage

```js
// vite.config.ts
import { defineConfig, Plugin } from 'vite';
import { vitePluginInjectDotenv } from 'vite-plugin-inject-dotenv';

export default defineConfig({
  ...
  plugins: [
    ...,
    vitePluginInjectDotenv({
      input: 'src/env.ts',
      dir: __dirname,
      sourcePriority: 'shell',
      inlineGeneratedEnv: true,
      shellEnvMap: {
        VITE_API_URL: '___VITE_API_URL'
      }
    }) as Plugin
  ],
});

```

## Plugin api

### `sourcePriority` 
Select source of the env variable values

#### `dotenv`
(default)
Use custom `.env.*` _e.g. (`.env.uat`, `.env.prod`)_ files for each target 
environment

#### `shell`
Use shell environments as source of the env variable values.

### `inlineGeneratedEnv`
Inline asset files within `bakeEnv.sh`

By default, the plugin creates separate asset files for each env.
These can be used post build to replace the original env asset file.

With this option set to true, No separate asset files are generated.
All asset file contents for each env are placed within `bakeEnv.sh` file.

### `babelPlugins`
babel plugins to compile env chunk

```
vitePluginInjectDotenv({
  input: 'src/env.ts',
  babelPlugins: ['@babel/plugin-transform-typescript']
})
```
