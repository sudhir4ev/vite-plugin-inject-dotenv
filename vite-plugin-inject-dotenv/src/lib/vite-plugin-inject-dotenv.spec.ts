import vitePluginInjectDotenv from './vite-plugin-inject-dotenv';

const sampleRuntimeEnvCode = `
export default {
  API_URL: import.meta.env.VITE_API_URL,
  AUTH_CLIENT_ID: import.meta.env.VITE_AUTH_CLIENT_ID
}
`;

describe('vitePluginInjectDotenv', () => {
  it('should work', async () => {
    const config = vitePluginInjectDotenv({
      input: 'runtime.env.ts',
      dir: `${__dirname}/../mocks`,
    });
    expect(
      await config.transform(sampleRuntimeEnvCode, 'src/runtime.env.ts')
    ).toEqual('sample code');
  });
});
