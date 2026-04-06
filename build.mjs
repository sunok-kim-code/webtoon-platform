import * as esbuild from "esbuild";
import { copyFileSync, mkdirSync } from "fs";

const isWatch = process.argv.includes("--watch");

// Ensure dist directory exists
mkdirSync("dist", { recursive: true });

const codeConfig = {
  entryPoints: ["src/code.ts"],
  bundle: true,
  outfile: "dist/code.js",
  target: "es2020",
  format: "iife",
};

// Copy ui.html to dist
copyFileSync("src/ui.html", "dist/ui.html");
console.log("Copied ui.html to dist/");

if (isWatch) {
  const ctx = await esbuild.context(codeConfig);
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await esbuild.build(codeConfig);
  console.log("Build complete.");
}
