import nextConfig from "../../packages/config/eslint/next.js";

export default [
  ...nextConfig,
  {
    rules: {
      // Standard data-fetching effects (void load() inside useEffect) are
      // intentional in the admin workspaces. The React Compiler
      // set-state-in-effect rule flags every synchronous setState inside
      // an effect as an error, which would require 25+ disables or a
      // render-vs-effect rewrite. Disable it for admin to keep lint clean
      // without changing runtime behavior.
      "react-hooks/set-state-in-effect": "off",
    },
  },
];
