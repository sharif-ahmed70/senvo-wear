import baseConfig from "../../packages/config/vitest/base.js";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    oxc: {
      jsx: {
        runtime: "automatic",
      },
    },
  }),
);
