import { createOpencode, type OpencodeClient } from "@opencode-ai/sdk/v2";
import { OrchestratorBot } from "./src/bot";
import { loadBotToken, loadConfig, ensureStateDir, STATE_DIR } from "./src/config";
import { postApprovalAndWait } from "./src/approval";
import { watch } from "fs";
import { join } from "path";
import type { TextChannel, Message } from "discord.js";

ensureStateDir();

const bot = new OrchestratorBot();

// Graceful shutdown
const shutdown = async () => {
  console.log("[orchestrator] Shutting down...");
  opsEventProcessing = false;
  await bot.shutdown();
  
  // 關閉 Ops OpenCode server
  if (opsServer) {
    opsServer.close();
    console.log("[orchestrator] Ops OpenCode server closed");
  }
  
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("unhandledRejection", (err) => {
  console.error("[orchestrator] Unhandled rejection:", err);
});

// Watch config for changes from ops session
let watchDebounce: ReturnType<typeof setTimeout> | null = null;
watch(join(STATE_DIR, "projects.json"), { persistent: true }, () => {
  if (watchDebounce) clearTimeout(watchDebounce);
  watchDebounce = setTimeout(() => {
    console.log("[orchestrator] Config changed, rebuilding channel map");
    bot.rebuildChannelMap();
  }, 200);
});

// Start API server for ops session to call Discord actions
const apiPort = await bot.startApiServer();

// Initialize OpenCode SDK for Ops mode
let opsClient: OpencodeClient | null = null;
let opsServer: { url: string; close(): void } | null = null;
let opsSessionId: string | null = null;
let opsChannel: TextChannel | null = null;
let opsThinkingMessage: Message | null = null;
let opsAutoApproved = new Set<string>();
let opsEventProcessing = false;

// Message buffer for streaming responses
interface MessageBuffer {
  text: string;
  lastSentAt: number;
  lastMessage: Message | null;
}
let opsMessageBuffer: MessageBuffer | null = null;

async function flushOpsBuffer(): Promise<void> {
  if (!opsMessageBuffer || !opsChannel || opsMessageBuffer.text.length === 0) return;
  try {
    while (opsMessageBuffer.text.length > 0) {
      const chunk = opsMessageBuffer.text.slice(0, 2000);
      opsMessageBuffer.text = opsMessageBuffer.text.slice(2000);
      opsMessageBuffer.lastMessage = await opsChannel.send(chunk);
    }
    opsMessageBuffer.lastSentAt = Date.now();
  } catch (e: any) {
    console.error("[orchestrator] Failed to send message:", e.message);
  }
}

async function startOpsEventListener(): Promise<void> {
  if (!opsClient || opsEventProcessing) return;
  console.log("[orchestrator] Starting Ops event listener...");
  opsEventProcessing = true;

  try {
    const events = await opsClient.event.subscribe();

    for await (const event of events.stream) {
      if (!opsEventProcessing) break;
      
      const sessionId = (event as any).properties?.sessionID;
      if (sessionId && sessionId !== opsSessionId) continue;

      console.log(`[orchestrator] Ops Event: ${event.type}`, JSON.stringify((event as any).properties || {}));

      switch (event.type) {
        case "session.status": {
          if (!opsChannel) break;
          const statusObj = (event as any).properties?.status;
          const status = typeof statusObj === 'string' ? statusObj : statusObj?.type;
          try {
            if (status === "busy" && !opsThinkingMessage) {
              opsThinkingMessage = await opsChannel.send("🤔 **Ops** 思考中...");
              await opsChannel.sendTyping();
            } else if (status === "idle" && opsThinkingMessage) {
              try { await opsThinkingMessage.delete(); } catch {}
              opsThinkingMessage = null;
            }
          } catch (e: any) {
            console.error("[orchestrator] status error:", e.message);
          }
          break;
        }

        case "permission.asked": {
          if (!opsChannel || !opsClient) break;
          const props = (event as any).properties;
          try {
            if (opsThinkingMessage) {
              try { await opsThinkingMessage.edit("🔐 **Ops** 等待權限確認..."); } catch {}
            }

            if (opsAutoApproved.has(props.permission)) {
              console.log(`[orchestrator] Auto-approving ${props.permission}`);
              await opsClient.permission.reply({ requestID: props.id, reply: "once" });
            } else {
              const result = await postApprovalAndWait(
                opsChannel,
                props.permission || "Unknown",
                props.metadata || {},
                60_000
              );
              const reply = result.decision === "allow" 
                ? (result.autoApprove ? "always" : "once") 
                : "reject";
              await opsClient.permission.reply({ requestID: props.id, reply });
              if (result.autoApprove) opsAutoApproved.add(props.permission);
            }

            if (opsThinkingMessage) {
              try { await opsThinkingMessage.edit("🤔 **Ops** 思考中..."); } catch {}
            }
          } catch (e: any) {
            console.error("[orchestrator] permission error:", e.message);
          }
          break;
        }

        case "message.part.delta": {
          if (!opsChannel) break;
          const props = (event as any).properties;
          const deltaText = props?.delta || (props?.part?.type === "text" ? props?.part?.text : null);
          const isTextDelta = props?.field === "text" || props?.part?.type === "text";
          if (isTextDelta && deltaText) {
            console.log(`[orchestrator] Ops delta text: ${deltaText.slice(0, 50)}...`);
            if (!opsMessageBuffer) {
              opsMessageBuffer = { text: "", lastSentAt: 0, lastMessage: null };
            }
            opsMessageBuffer.text += deltaText;
            const now = Date.now();
            if ((now - opsMessageBuffer.lastSentAt >= 2000 && opsMessageBuffer.text.length > 0) || 
                opsMessageBuffer.text.length >= 1500) {
              await flushOpsBuffer();
            }
          }
          break;
        }

        case "message.updated": {
          const props = (event as any).properties;
          if (props?.message?.role === "assistant") {
            if (opsMessageBuffer && opsMessageBuffer.text.length > 0) {
              await flushOpsBuffer();
            }
            opsMessageBuffer = null;
            bot.rebuildChannelMap();
            console.log("[orchestrator] Channel map rebuilt after ops response");
          }
          break;
        }

        case "session.error": {
          if (!opsChannel) break;
          const props = (event as any).properties;
          try {
            await opsChannel.send(`❌ Session error: ${props?.error || "Unknown error"}`);
          } catch {}
          if (opsThinkingMessage) {
            try { await opsThinkingMessage.delete(); } catch {}
            opsThinkingMessage = null;
          }
          opsMessageBuffer = null;
          break;
        }
      }
    }
  } catch (error: any) {
    console.error("[orchestrator] Event listener error:", error.message);
    opsEventProcessing = false;
  }
}

console.log("[orchestrator] Initializing OpenCode SDK for Ops mode...");
console.log("[orchestrator] STATE_DIR:", STATE_DIR);
try {
  const { client, server } = await createOpencode({
    hostname: "127.0.0.1",
    port: 0,
    config: {
      model: "anthropic/claude-sonnet-4-6",
    },
  });
  opsClient = client;
  opsServer = server;
  console.log(`[orchestrator] Ops OpenCode server started at ${server.url}`);
  
  // 預先建立 session，避免第一次訊息延遲
  console.log("[orchestrator] Pre-creating Ops session...");
  const preCreateResult = await client.session.create({
    directory: STATE_DIR,
    title: "Discord Ops Session",
  });
  console.log("[orchestrator] Pre-create result:", JSON.stringify(preCreateResult, null, 2));
  if (preCreateResult.data?.id) {
    opsSessionId = preCreateResult.data.id;
    console.log(`[orchestrator] Pre-created Ops session ${opsSessionId}`);
    // Start event listener
    startOpsEventListener();
  } else {
    console.error("[orchestrator] Failed to pre-create Ops session");
  }
} catch (error: any) {
  console.error("[orchestrator] Failed to initialize Ops OpenCode SDK:", error.message);
  console.error("[orchestrator] Full error:", error);
  process.exit(1);
}

bot.onOpsMessage(async (msg: Message) => {
  if (!opsClient) {
    opsChannel = msg.channel as TextChannel;
    await opsChannel.send("❌ Ops OpenCode SDK not initialized");
    return;
  }

  opsChannel = msg.channel as TextChannel;
  await opsChannel.sendTyping();

  const opsSystemPrompt = `You are the admin assistant for a Discord orchestrator.
You manage projects and channel bindings by editing the config file at ${STATE_DIR}/projects.json.

Current config:
${JSON.stringify(loadConfig(), null, 2)}

The config schema:
- projects: Record<name, { name, path, channels: string[] }>
- ops_channel: string (this channel's ID)
- idle_timeout_ms: number

## Config Operations
To register a project: add an entry to projects with name, path (validate path exists with Read on the directory), and empty channels array.
To bind a channel: add the channel ID string to the project's channels array.
To unbind: remove the channel ID from the channels array.
To unregister: delete the project entry.

Always read the file first, modify, then write back. Use the Edit tool for surgical changes.

## Discord API (localhost HTTP)
You can interact with Discord via the orchestrator's API at http://127.0.0.1:${apiPort}. Use Bash with curl:

- **List guilds (servers):**
  curl -s http://127.0.0.1:${apiPort}/guilds

- **List text channels in a guild:**
  curl -s "http://127.0.0.1:${apiPort}/channels?guild_id=GUILD_ID"

- **Create a new text channel:**
  curl -s -X POST http://127.0.0.1:${apiPort}/create-channel -H "Content-Type: application/json" -d '{"guild_id":"GUILD_ID","name":"channel-name"}'
  Optionally pass "category_id" to place it under a category.

After creating a channel, auto-bind it to the project by updating projects.json with the returned channel_id.

  - **Clear a project session (fresh start):**
  curl -s -X POST http://127.0.0.1:${apiPort}/clear-session -H "Content-Type: application/json" -d '{"project_name":"PROJECT_NAME"}'
  This aborts any active session and wipes the saved session ID so the next message starts fresh.`;

  try {
    // Get or create Ops session (should already exist from pre-creation)
    if (!opsSessionId) {
      console.log("[orchestrator] Creating new Ops session (fallback)...");
      const result = await opsClient.session.create({
        directory: STATE_DIR,
        title: "Discord Ops Session",
      });
      console.log("[orchestrator] session.create result:", JSON.stringify(result, null, 2));
      if (!result.data?.id) {
        console.error("[orchestrator] session.create returned no id");
        await opsChannel.send("❌ Failed to create Ops session");
        return;
      }
      opsSessionId = result.data.id;
      console.log(`[orchestrator] Created Ops session ${opsSessionId}`);
      // Start event listener for fallback session
      startOpsEventListener();
    }

    // 發送系統提示 (只在第一次訊息時)
    const messages = await opsClient.session.messages({
      sessionID: opsSessionId,
    });
    
    if (!messages.data || messages.data.length === 0) {
      console.log("[orchestrator] Injecting system prompt...");
      await opsClient.session.prompt({
        sessionID: opsSessionId,
        noReply: true,
        parts: [{ type: "text", text: opsSystemPrompt }],
      });
    }

    // 發送使用者訊息 (async - response handled by events)
    console.log("[orchestrator] Sending user prompt:", msg.content);
    await opsClient.session.promptAsync({
      sessionID: opsSessionId,
      parts: [{ type: "text", text: msg.content }],
    });
  } catch (err: any) {
    await opsChannel.send(`❌ Ops error: ${err.message}`);
    console.error("[orchestrator] Ops error:", err);
    opsSessionId = null;
  }
});

// Start
const token = loadBotToken();
console.log("[orchestrator] Starting...");
await bot.start(token);
