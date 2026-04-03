import { readFileSync, writeFileSync } from 'fs';

const file = 'server.ts';
let content = readFileSync(file, 'utf-8');

// 在發送回應的地方加 debug
const oldCode = `    // 發送回應
    if (result.data?.parts) {
      let responseText = "";
      for (const part of result.data.parts) {
        if (part.type === "text" && part.text) {
          responseText += part.text;
        }
      }
      
      // Discord 2000 字元限制,分段發送
      while (responseText.length > 0) {
        const chunk = responseText.slice(0, 2000);
        responseText = responseText.slice(2000);
        await channel.send(chunk);
      }
    }`;

const newCode = `    // 發送回應
    if (result.data?.parts) {
      console.log('[orchestrator] Processing response parts, count:', result.data.parts.length);
      let responseText = "";
      for (const part of result.data.parts) {
        console.log('[orchestrator] Part type:', part.type);
        if (part.type === "text" && part.text) {
          responseText += part.text;
        }
      }
      
      console.log('[orchestrator] Response text length:', responseText.length);
      console.log('[orchestrator] Response text:', responseText.substring(0, 100));
      
      // Discord 2000 字元限制,分段發送
      while (responseText.length > 0) {
        const chunk = responseText.slice(0, 2000);
        responseText = responseText.slice(2000);
        console.log('[orchestrator] Sending chunk to Discord, length:', chunk.length);
        await channel.send(chunk);
        console.log('[orchestrator] Chunk sent successfully');
      }
    } else {
      console.log('[orchestrator] No parts in response!');
    }`;

content = content.replace(oldCode, newCode);
writeFileSync(file, content);
console.log('Response debug added!');
