import { readFileSync, writeFileSync } from 'fs';

const file = 'server.ts';
let content = readFileSync(file, 'utf-8');

// 在 session.create 前後加入詳細 debug
const oldCode = `    // Get or create Ops session
    if (!opsSessionId) {
      const result = await opsClient.session.create({
        body: {
          title: "Discord Ops Session",
          directory: STATE_DIR,
        },
      });
      if (!result.data?.id) {
        await channel.send("❌ Failed to create Ops session");
        return;
      }`;

const newCode = `    // Get or create Ops session
    if (!opsSessionId) {
      console.log('[orchestrator] Creating Ops session with directory:', STATE_DIR);
      const result = await opsClient.session.create({
        body: {
          title: "Discord Ops Session",
          directory: STATE_DIR,
        },
      });
      console.log('[orchestrator] Session create result:', JSON.stringify(result, null, 2));
      if (!result.data?.id) {
        console.error('[orchestrator] Failed to create Ops session - no session ID returned');
        await channel.send("❌ Failed to create Ops session");
        return;
      }`;

content = content.replace(oldCode, newCode);
writeFileSync(file, content);
console.log('Ops debug added!');
