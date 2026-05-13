import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/standalone.ts"],
  format: ["cjs"],
  platform: "node",
  target: "node20",
  bundle: true,
  noExternal: [/.*/],
  outDir: "dist-standalone",
  clean: true,
  dts: false,
  shims: true,
  sourcemap: false,
  splitting: false,
  outExtension() {
    return {
      js: ".cjs"
    };
  }
});
