/**
 * Safe startup script for discord-orchestrator
 * 
 * This script:
 * 1. Checks TypeScript compilation before starting
 * 2. If compilation fails, auto-restores from git
 * 3. Then starts the actual server
 */

import { spawnSync } from "child_process";
import { existsSync } from "fs";

const CWD = "E:/Tools/lizard-market/plugins/discord-orchestrator";

function log(msg: string) {
  console.log(`[safe-start] ${msg}`);
}

function runCommand(cmd: string, args: string[]): { success: boolean; output: string } {
  const result = spawnSync(cmd, args, { 
    cwd: CWD, 
    encoding: "utf-8",
    shell: true 
  });
  return {
    success: result.status === 0,
    output: (result.stdout || "") + (result.stderr || "")
  };
}

async function main() {
  log("Checking TypeScript compilation...");
  
  // Step 1: Run tsc --noEmit to check for errors
  const tscResult = runCommand("npx", ["tsc", "--noEmit"]);
  
  if (!tscResult.success) {
    log("❌ TypeScript compilation failed!");
    log(tscResult.output);
    
    // Step 2: Auto-restore from git
    log("🔄 Auto-restoring files from git...");
    
    const restoreResult = runCommand("git", ["restore", "src/", "server.ts"]);
    if (restoreResult.success) {
      log("✅ Files restored from git");
    } else {
      log("❌ Git restore failed: " + restoreResult.output);
    }
    
    // Step 3: Check again after restore
    const recheckResult = runCommand("npx", ["tsc", "--noEmit"]);
    if (!recheckResult.success) {
      log("❌ Still failing after restore. Manual intervention needed.");
      log(recheckResult.output);
      process.exit(1);
    }
    log("✅ TypeScript compilation passed after restore");
  } else {
    log("✅ TypeScript compilation passed");
  }
  
  // Step 4: Start the actual server
  log("Starting server.ts...");
  
  // Use dynamic import to start the server
  await import("./server.ts");
}

main().catch((err) => {
  log(`Fatal error: ${err.message}`);
  process.exit(1);
});
