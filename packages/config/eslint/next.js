import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import baseConfig from "./base.js";

export default [...baseConfig, ...nextVitals, ...nextTypescript];
