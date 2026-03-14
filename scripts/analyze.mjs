import { readdirSync, statSync, existsSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const rootDir = process.cwd();
const distDir = resolve(rootDir, "dist");
const statsPath = resolve(distDir, "stats.html");
const files = collectFiles(distDir).filter((file) =>
  [".js", ".css", ".html"].includes(extname(file))
);

if (files.length === 0) {
  console.log("No build assets found in dist/. Run the build first.");
  process.exit(0);
}

const rows = files.map((file) => {
  const size = statSync(file).size;

  return {
    file,
    relativePath: relative(rootDir, file),
    size
  };
});

rows.sort((left, right) => right.size - left.size);

const maxSize = Math.max(...rows.map((row) => row.size));

console.log("Bundle size summary");

for (const row of rows) {
  const width = Math.max(1, Math.round((row.size / maxSize) * 30));
  const bar = "█".repeat(width);
  console.log(
    `${row.relativePath.padEnd(40)} ${formatSize(row.size).padStart(10)}  ${bar}`
  );
}

console.log("");

if (existsSync(statsPath)) {
  console.log(`Visualizer report: ${relative(rootDir, statsPath)}`);
} else {
  console.log("Visualizer report was not emitted. Fallback summary shown above.");
}

function collectFiles(directory) {
  return readdirSync(directory, {
    withFileTypes: true
  }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectFiles(fullPath);
    }

    return [fullPath];
  });
}

function formatSize(size) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  }

  if (size >= 1024) {
    return `${(size / 1024).toFixed(2)} kB`;
  }

  return `${size} B`;
}
