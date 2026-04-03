const fs = require('fs');
const path = 'E:/Tools/lizard-market/plugins/discord-orchestrator/server.ts';
let content = fs.readFileSync(path, 'utf8');

// 1. Add permission helper function before bot.onOpsMessage
const permissionHelper = `
// Handle permission request - send to Discord and wait for reply
async function handlePermissionRequest(
  channel: TextChannel,
  permission: any,
  opsClient: OpencodeClient
): Promise<void> {
  const requestId = permission.id || permission.requestID;
  const permissionType = permission.permission || permission.type || 'unknown';
  const pattern = permission.pattern || '*';
  const metadata = permission.metadata || {};
  
  // Format permission request message
  let permMsg = "🔐 **權限請求**\n";
  permMsg += "類型: " + permissionType + "\n";
  permMsg += "模式: " + pattern + "\n";
  if (metadata.command) permMsg += "指令: \`" + metadata.command + "\`\n";
  if (metadata.path) permMsg += "路徑: " + metadata.path + "\n";
  permMsg += "\n回覆 **yes** 允許一次, **always** 永久允許, **no** 拒絕";
  
  await channel.send(permMsg);
  
  // Wait for user reply (60 second timeout)
  try {
    const filter = (m: any) => ['yes', 'always', 'no', 'y', 'n'].includes(m.content.toLowerCase());
    const collected = await channel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });
    const reply = collected.first()?.content.toLowerCase() || 'no';
    
    let replyAction: 'once' | 'always' | 'reject' = 'reject';
    if (reply === 'yes' || reply === 'y') replyAction = 'once';
    else if (reply === 'always') replyAction = 'always';
    
    // Send reply to OpenCode
    await opsClient.permission.reply({
      requestID: requestId,
      reply: replyAction,
    });
    
    const msg = replyAction === 'reject' ? '❌ 已拒絕' : ('✅ 已' + (replyAction === 'always' ? '永久' : '') + '允許');
    await channel.send(msg);
  } catch (e) {
    // Timeout - auto reject
    await opsClient.permission.reply({
      requestID: requestId,
      reply: 'reject',
    });
    await channel.send('⏰ 權限請求超時，已自動拒絕');
  }
}

`;

// Insert before bot.onOpsMessage
content = content.replace(
  'bot.onOpsMessage(async (msg: Message) => {',
  permissionHelper + 'bot.onOpsMessage(async (msg: Message) => {'
);

// 2. Add permission check in polling loop
const oldCheck = `      } catch (e) {
        // Ignore progress errors
      }
      
      // Check if done`;

const newCheck = `      } catch (e) {
        // Ignore progress errors
      }
      
      // Check for pending permission requests
      try {
        const permList = await opsClient.permission.list();
        if (permList.data && Array.isArray(permList.data) && permList.data.length > 0) {
          for (const perm of permList.data) {
            console.log('[orchestrator] Permission requested:', perm);
            await handlePermissionRequest(channel, perm, opsClient);
          }
        }
      } catch (e) {
        // Ignore permission check errors
      }
      
      // Check if done`;

content = content.replace(oldCheck, newCheck);

fs.writeFileSync(path, content, 'utf8');
console.log('Added permission handling!');
