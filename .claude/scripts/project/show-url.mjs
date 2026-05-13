#!/usr/bin/env node
import { spawn } from "node:child_process";

function quoteForShell(value) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function platformOpenCommand(url) {
  switch (process.platform) {
    case "darwin":
      return { command: "open", args: [url], display: `open ${quoteForShell(url)}` };
    case "win32":
      return { command: "cmd.exe", args: ["/c", "start", "", url], display: `start ${quoteForShell(url)}` };
    default:
      return { command: "xdg-open", args: [url], display: `xdg-open ${quoteForShell(url)}` };
  }
}

function viewerUrlFromSlug(slug) {
  if (!slug) throw new Error("Usage: node show-url.mjs <world-slug-or-url>");
  if (/^https?:\/\//u.test(slug)) return slug;
  return `http://localhost:5173/${encodeURIComponent(slug)}`;
}

async function main() {
  const slug = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  const url = viewerUrlFromSlug(slug);
  const openCommand = platformOpenCommand(url);

  console.log(`URL: ${url}`);
  console.log(`Fallback command: ${openCommand.display}`);

  if (process.argv.includes("--print-only") || process.env.CI) {
    return;
  }

  const child = spawn(openCommand.command, openCommand.args, {
    detached: true,
    stdio: "ignore"
  });

  child.on("error", (error) => {
    console.error(`Could not open URL automatically: ${error.message}`);
    process.exitCode = 1;
  });

  child.unref();
  await new Promise((resolve) => setTimeout(resolve, 100));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
