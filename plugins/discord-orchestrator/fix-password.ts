import { readFileSync, writeFileSync } from 'fs';

// 修正 server.ts
let serverContent = readFileSync('server.ts', 'utf-8');
serverContent = serverContent.replace(
  `    config: {
      model: "anthropic/claude-sonnet-4-6",
      password: process.env.OPENCODE_SERVER_PASSWORD || "discord-orchestrator-ops",
    },`,
  `    config: {
      model: "anthropic/claude-sonnet-4-6",
    },`
);
writeFileSync('server.ts', serverContent);
console.log('Fixed server.ts');

// 修正 session-manager.ts
let sessionContent = readFileSync('src/session-manager.ts', 'utf-8');
sessionContent = sessionContent.replace(
  `        config: {
          model: "anthropic/claude-sonnet-4-6",
          password: process.env.OPENCODE_SERVER_PASSWORD || "discord-orchestrator-projects",
        },`,
  `        config: {
          model: "anthropic/claude-sonnet-4-6",
        },`
);
writeFileSync('src/session-manager.ts', sessionContent);
console.log('Fixed session-manager.ts');
