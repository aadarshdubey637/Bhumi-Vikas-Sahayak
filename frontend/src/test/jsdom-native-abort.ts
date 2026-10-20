// Vitest environment: jsdom, but keeping Node's own AbortController/AbortSignal.
// Why: vitest's jsdom environment replaces them with jsdom's classes, and Node >= 24's built-in fetch (used by MSW's interceptors)
// throws "Expected signal to be an instance of AbortSignal" for those, which broke every test that calls the API client.
import type { Environment } from "vitest/environments";
import { builtinEnvironments } from "vitest/environments";

const env: Environment = {
  name: "jsdom-native-abort",
  transformMode: "web",
  async setup(global, options) {
    const g = global as unknown as Record<string, unknown>;
    const nativeController = g.AbortController;
    const nativeSignal = g.AbortSignal;
    const jsdom = await builtinEnvironments.jsdom.setup(global, options);
    g.AbortController = nativeController;
    g.AbortSignal = nativeSignal;
    return jsdom;
  },
};

export default env;
