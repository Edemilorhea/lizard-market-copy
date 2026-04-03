import { readFileSync, writeFileSync } from 'fs';

const file = 'server.ts';
let content = readFileSync(file, 'utf-8');

// 在 prompt 前後加入 debug
const oldCode = `    // 發送使用者訊息
    const result = await opsClient.session.prompt({
      path: { id: opsSessionId },
      body: {
        parts: [{ type: "text", text: msg.content }],
      },
    });

    // 發送回應
    if (result.data?.parts) {`;

const newCode = `    // 發送使用者訊息
    console.log('[orchestrator] Sending prompt to Ops session:', msg.content);
    const result = await opsClient.session.prompt({
      path: { id: opsSessionId },
      body: {
        parts: [{ type: "text", text: msg.content }],
      },
    });
    console.log('[orchestrator] Prompt result:', JSON.stringify(result, null, 2));

    // 發送回應
    if (result.data?.parts) {`;

content = content.replace(oldCode, newCode);
writeFileSync(file, content);
console.log('Prompt debug added!');
