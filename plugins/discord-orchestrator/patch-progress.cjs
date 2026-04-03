const fs = require('fs');
const path = 'E:/Tools/lizard-market/plugins/discord-orchestrator/server.ts';
let content = fs.readFileSync(path, 'utf8');

// Add helper function after sendToDiscord function (around line 78)
const helperFunc = `

// Extract progress from assistant message parts
function extractProgress(parts: any[]): string[] {
  const items: string[] = [];
  for (const part of parts) {
    if (part.type === "tool-invocation" || part.type === "tool-call") {
      const toolName = part.toolInvocation?.toolName || part.toolName || part.name || "tool";
      const state = part.toolInvocation?.state || part.state || "running";
      const icon = state === "completed" ? "✅" : "🔧";
      items.push(\`\${icon} \${toolName}\`);
    }
    if (part.type === "text" && part.text) {
      const snippet = part.text.substring(0, 60).replace(/\n/g, " ").trim();
      if (snippet.length > 0) {
        items.push(\`💭 \${snippet}\${part.text.length > 60 ? "..." : ""}\`);
      }
    }
  }
  return items;
}
`;

// Insert helper function after sendToDiscord
content = content.replace(
  'bot.onOpsMessage(async (msg: Message) => {',
  helperFunc + '\nbot.onOpsMessage(async (msg: Message) => {'
);

// Replace the polling loop
const oldPolling = `    // Poll for completion
    let attempts = 0;
    const maxAttempts = 120; // Max 2 minutes
    let responseText = "";
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
      
      // Keep typing indicator
      if (attempts % 5 === 0) {
        await channel.sendTyping();
      }
      
      // Check session status (returns { [sessionId]: SessionStatus })
      const status = await opsClient.session.status();
      const sessionStatus = status.data?.[opsSessionId];
      
      if (!sessionStatus || sessionStatus.type !== "busy") {
        console.log('[orchestrator] Session completed');
        
        // Get latest messages
        const messagesResult = await opsClient.session.messages({
          path: { id: opsSessionId },
        });
        
        if (messagesResult.data && messagesResult.data.length > 0) {
          const lastAssistantMsg = [...messagesResult.data]
            .reverse()
            .find((m: any) => m.info?.role === "assistant");
          
          if (lastAssistantMsg?.parts) {
            for (const part of lastAssistantMsg.parts) {
              if (part.type === "text" && part.text) {
                responseText += part.text;
              }
            }
          }
        }
        break;
      }
      
      // Update progress every 30 seconds
      if (attempts % 30 === 0) {
        try {
          await processingMsg.edit(\`⏳ 仍在處理中... (\${attempts}秒)\`);
        } catch {}
      }
    }`;

const newPolling = `    // Poll for completion with live progress
    let attempts = 0;
    const maxAttempts = 120; // Max 2 minutes
    let responseText = "";
    let lastProgressText = "";
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5s interval
      attempts++;
      
      // Keep typing indicator
      if (attempts % 4 === 0) {
        await channel.sendTyping();
      }
      
      // Check session status
      const status = await opsClient.session.status();
      const sessionStatus = status.data?.[opsSessionId];
      
      // Fetch current progress
      try {
        const messagesResult = await opsClient.session.messages({
          path: { id: opsSessionId },
        });
        
        if (messagesResult.data && messagesResult.data.length > 0) {
          const lastAssistantMsg = [...messagesResult.data]
            .reverse()
            .find((m: any) => m.info?.role === "assistant");
          
          if (lastAssistantMsg?.parts && lastAssistantMsg.parts.length > 0) {
            const progressItems = extractProgress(lastAssistantMsg.parts);
            if (progressItems.length > 0) {
              // Show last 4 items
              const recent = progressItems.slice(-4);
              const elapsed = Math.round(attempts * 1.5);
              const progressText = \`⏳ 處理中 (\${elapsed}s)\n\${recent.join("\n")}\`;
              
              if (progressText !== lastProgressText) {
                lastProgressText = progressText;
                try {
                  // Discord message limit is 2000, but keep it short
                  await processingMsg.edit(progressText.substring(0, 500));
                } catch {}
              }
            }
          }
        }
      } catch (e) {
        // Ignore progress errors
      }
      
      // Check if done
      if (!sessionStatus || sessionStatus.type !== "busy") {
        console.log('[orchestrator] Session completed');
        
        // Get final response
        const messagesResult = await opsClient.session.messages({
          path: { id: opsSessionId },
        });
        
        if (messagesResult.data && messagesResult.data.length > 0) {
          const lastAssistantMsg = [...messagesResult.data]
            .reverse()
            .find((m: any) => m.info?.role === "assistant");
          
          if (lastAssistantMsg?.parts) {
            for (const part of lastAssistantMsg.parts) {
              if (part.type === "text" && part.text) {
                responseText += part.text;
              }
            }
          }
        }
        break;
      }
    }`;

if (content.includes(oldPolling)) {
  content = content.replace(oldPolling, newPolling);
  fs.writeFileSync(path, content, 'utf8');
  console.log('✅ Updated with live progress!');
} else {
  console.log('❌ Could not find polling code to replace');
  // Debug: show what we have around line 195
  const lines = content.split('\n');
  console.log('Lines 195-210:');
  for (let i = 194; i < 210 && i < lines.length; i++) {
    console.log(`${i+1}: ${lines[i]}`);
  }
}
