import * as esbuild from "esbuild";
import { copyFileSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes("--watch");

// Ensure dist directory exists
mkdirSync("dist", { recursive: true });

// Resolve @webtoon/shared to the monorepo shared package
import { existsSync } from "fs";
const sharedRoot = path.resolve(__dirname, "../shared");
const sharedAlias = {
  name: "webtoon-shared-resolver",
  setup(build) {
    build.onResolve({ filter: /^@webtoon\/shared/ }, (args) => {
      const subpath = args.path.replace("@webtoon/shared", "").replace(/^\//, "");
      if (!subpath) {
        return { path: path.join(sharedRoot, "types", "index.ts") };
      }
      // Try exact file first (e.g. "types/panel" → "types/panel.ts")
      const asFile = path.join(sharedRoot, subpath + ".ts");
      if (existsSync(asFile)) return { path: asFile };
      // Try as directory index (e.g. "constants" → "constants/index.ts")
      const asDir = path.join(sharedRoot, subpath, "index.ts");
      if (existsSync(asDir)) return { path: asDir };
      // Fallback
      return { path: path.join(sharedRoot, subpath) };
    });
  },
};

const codeConfig = {
  entryPoints: ["src/plugin/controller.ts"],
  bundle: true,
  outfile: "dist/code.js",
  target: "es2015",
  format: "iife",
  plugins: [sharedAlias],
};

const uiConfig = {
  entryPoints: ["src/ui/index.tsx"],
  bundle: true,
  outfile: "dist/index.js",
  target: "es2020",
  format: "iife",
  jsx: "transform",
  jsxFactory: "React.createElement",
  jsxFragment: "React.Fragment",
  external: [],
};

// Copy ui.html to dist
copyFileSync("src/ui/index.html", "dist/ui.html");
console.log("Copied ui/index.html to dist/ui.html");

if (isWatch) {
  const codeCtx = await esbuild.context(codeConfig);
  const uiCtx = await esbuild.context(uiConfig);
  await codeCtx.watch();
  await uiCtx.watch();
  console.log("Watching for changes...");
} else {
  await esbuild.build(codeConfig);
  await esbuild.build(uiConfig);
  console.log("Build complete: code.js and index.js");
}
