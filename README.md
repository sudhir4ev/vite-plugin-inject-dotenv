<h1 align="center">vite-plugin-inject-dotenv</h1>

<p align="center">
  A Vite plugin to inject env variables into a selected source file after the build. This
allows us to create customize build for a given deployment env without performing a full build.
</p>

## Install

```sh
npm i vite-plugin-inject-dotenv -D
```

## Usage

In `vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import vitePluginInjectDotenv from 'vite-plugin-inject-dotenv'

export default defineConfig({
  plugins: [vitePluginInjectDotenv({
    input: 'src/env.ts',
  })]
})
```

## Options

```ts
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
};

```

## Example

Check `apps/sample` for a working example in a a react project

## License

MIT License.
