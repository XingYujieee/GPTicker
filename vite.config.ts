import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";

const rootDir = dirname(fileURLToPath(import.meta.url));
const analyzeBundle = process.env.ANALYZE === "true";
const shouldOpenVisualizer = process.env.OPEN_VISUALIZER !== "0";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    ...(analyzeBundle
      ? [
          visualizer({
            filename: resolve(rootDir, "dist/stats.html"),
            open: shouldOpenVisualizer,
            gzipSize: true,
            template: "treemap"
          })
        ]
      : [])
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        "content-main": resolve(rootDir, "src/content/index.tsx")
      },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name].[ext]",
        manualChunks: {
          "logic-graph-vendor": [
            "echarts/core",
            "echarts/charts",
            "echarts/components",
            "echarts/renderers",
            "zrender"
          ],
          "r3f-fiber": ["@react-three/fiber"],
          "three-core": ["three"],
          "three-controls": ["three/examples/jsm/controls/OrbitControls.js"],
          "react-vendor": ["react", "react-dom", "scheduler"]
        }
      }
    }
  }
});
