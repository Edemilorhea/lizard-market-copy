import { createOpencode, type OpencodeClient } from "@opencode-ai/sdk";
import { OrchestratorBot } from "./src/bot";
import { loadBotToken, loadConfig, ensureStateDir, STATE_DIR } from "./src/config";
import { watch } from "fs";
import { join } from "path";
import type { TextChannel, Message } from "discord.js";

ensureStateDir();

const bot = new OrchestratorBot();

// Graceful shutdown
const shutdown = async () => {
  console.log("[orchestrator] Shutting down...");
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

console.log("[orchestrator] Initializing OpenCode SDK for Ops mode...");
try {
  const { client, server } = await createOpencode({
    hostname: "127.0.0.1",
    port: 0, // 使用動態 port,避免衝突
    config: {
      model: "anthropic/claude-sonnet-4-6",
      password: process.env.OPENCODE_SERVER_PASSWORD || "discord-orchestrator-ops",
    },
  });
  opsClient = client;
  opsServer = server;
  console.log(`[orchestrator] Ops OpenCode server started at ${server.url}`);
} catch (error: any) {
  console.error("[orchestrator] Failed to initialize Ops OpenCode SDK:", error.message);
  console.error("[orchestrator] Full error:", error);
  process.exit(1);
}

bot.onOpsMessage(async (msg: Message) => {
  if (!opsClient) {
    const channel = msg.channel as TextChannel;
    await channel.send("❌ Ops OpenCode SDK not initialized");
    return;
  }

  const channel = msg.channel as TextChannel;
  await channel.sendTyping();

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
    // Get or create Ops session
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
      }
      opsSessionId = result.data.id;
      console.log(`[orchestrator] Created Ops session ${opsSessionId}`);
    }

    // 發送系統提示 (只在第一次訊息時)
    // 注意: OpenCode SDK 可能需要不同的方式設置 system prompt
    // 這裡先用 noReply 方式注入上下文
    const messages = await opsClient.session.messages({
      path: { id: opsSessionId },
    });
    
    if (!messages.data || messages.data.length === 0) {
      // 第一次訊息,注入 system prompt
      await opsClient.session.prompt({
        path: { id: opsSessionId },
        body: {
          noReply: true,
          parts: [{ type: "text", text: opsSystemPrompt }],
        },
      });
    }

    // 發送使用者訊息
    const result = await opsClient.session.prompt({
      path: { id: opsSessionId },
      body: {
        parts: [{ type: "text", text: msg.content }],
      },
    });

    // 發送回應
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
    }

    // Always rebuild after ops query — fs.watch is unreliable on WSL2
    bot.rebuildChannelMap();
    console.log("[orchestrator] Channel map rebuilt after ops query");
  } catch (err: any) {
    await channel.send(`❌ Ops error: ${err.message}`);
    console.error("[orchestrator] Ops error:", err);
    // 清除 session ID,下次重新建立
    opsSessionId = null;
  }
});

// Start
const token = loadBotToken();
console.log("[orchestrator] Starting...");
await bot.start(token);
