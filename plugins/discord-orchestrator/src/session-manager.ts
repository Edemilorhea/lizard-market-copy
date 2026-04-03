import { createOpencode, type OpencodeClient } from "@opencode-ai/sdk";
import type { Client, TextChannel, Message } from "discord.js";
import type { ActiveSession, ProjectConfig, SessionsState } from "./types";
import { loadSessions, saveSessions } from "./config";
import { postApprovalAndWait } from "./approval";

/**
 * SessionManager 使用 OpenCode SDK 管理多專案會話
 * 
 * 架構變更:
 * - 共用一個 OpenCode server instance
 * - 每個專案有獨立的 OpenCode session
 * - 透過 event.subscribe() 全域事件流接收所有回應
 * - 根據 session_id 過濾並路由訊息到正確的 Discord 頻道
 */
export class SessionManager {
  private sessions = new Map<string, ActiveSession>();
  private savedSessions: SessionsState;
  private idleTimeoutMs: number;
  private saveQueue: Promise<void> = Promise.resolve();
  private discordClient: Client | null = null;
  
  // OpenCode SDK client - 全域共用
  private opencodeClient: OpencodeClient | null = null;
  private opencodeServer: { url: string; close(): void } | null = null;
  private eventSubscription: any = null;
  private eventProcessing = false;

  constructor(idleTimeoutMs: number) {
    this.idleTimeoutMs = idleTimeoutMs;
    this.savedSessions = loadSessions();
  }

  /**
   * 初始化 OpenCode SDK 並啟動事件監聽
   */
  async initialize(): Promise<void> {
    console.log("[session-manager] Initializing OpenCode SDK...");
    try {
      const { client, server } = await createOpencode({
        hostname: "127.0.0.1",
        port: 0, // 使用動態 port,避免衝突
        config: {
          model: "anthropic/claude-sonnet-4-6",
        },
      });
      this.opencodeClient = client;
      this.opencodeServer = server;
      console.log(`[session-manager] OpenCode server started at ${server.url}`);
      
      // 啟動全域事件監聽
      this.startEventListener();
    } catch (error: any) {
      console.error("[session-manager] Failed to initialize OpenCode SDK:", error.message);
      console.error("[session-manager] Full error:", error);
      throw error;
    }
  }

  /**
   * 啟動全域事件監聽器
   * 處理所有 session 的訊息並路由到對應的 Discord 頻道
   */
  private async startEventListener(): Promise<void> {
    if (!this.opencodeClient || this.eventProcessing) return;
    
    console.log("[session-manager] Starting global event listener...");
    this.eventProcessing = true;

    try {
      const events = await this.opencodeClient.event.subscribe();
      
      // 追蹤每個 session 的訊息緩衝
      const messageBuffers = new Map<string, {
        text: string;
        lastSentAt: number;
        lastMessage: Message | null;
        channel: TextChannel | null;
      }>();

      for await (const event of events.stream) {
        if (!this.eventProcessing) break;

        // 過濾訊息事件
        if (event.type !== "message") continue;
        
        const msgEvent = event as any;
        const sessionId = msgEvent.session_id;
        if (!sessionId) continue;

        // 找到對應的專案 session
        const projectSession = Array.from(this.sessions.values()).find(
          s => s.sessionId === sessionId
        );
        if (!projectSession) continue;

        // 找到對應的 Discord 頻道
        if (!this.discordClient) continue;
        let channel: TextChannel;
        try {
          channel = await this.discordClient.channels.fetch(
            projectSession.lastActiveChannel
          ) as TextChannel;
        } catch {
          continue;
        }

        // 初始化緩衝
        if (!messageBuffers.has(sessionId)) {
          messageBuffers.set(sessionId, {
            text: "",
            lastSentAt: 0,
            lastMessage: null,
            channel,
          });
        }

        const buffer = messageBuffers.get(sessionId)!;
        buffer.channel = channel;

        // 收集 assistant 的文字輸出
        if (msgEvent.role === "assistant") {
          for (const part of msgEvent.parts || []) {
            if (part.type === "text" && part.text) {
              buffer.text += part.text;
            }
          }

          // 定期發送緩衝 (每2秒或達到1500字元)
          const now = Date.now();
          if ((now - buffer.lastSentAt >= 2000 && buffer.text.length > 0) || 
              buffer.text.length >= 1500) {
            await this.flushBuffer(buffer);
          }
        }

        // 訊息完成後,發送剩餘緩衝並清理
        if (msgEvent.status === "completed" || msgEvent.status === "error") {
          await this.flushBuffer(buffer);
          messageBuffers.delete(sessionId);
        }
      }
    } catch (error: any) {
      console.error("[session-manager] Event listener error:", error.message);
      this.eventProcessing = false;
    }
  }

  /**
   * 發送緩衝的文字到 Discord
   */
  private async flushBuffer(buffer: {
    text: string;
    lastSentAt: number;
    lastMessage: Message | null;
    channel: TextChannel | null;
  }): Promise<void> {
    if (!buffer.channel || buffer.text.length === 0) return;

    try {
      // Discord 限制 2000 字元,需要分段
      while (buffer.text.length > 0) {
        const chunk = buffer.text.slice(0, 2000);
        buffer.text = buffer.text.slice(2000);
        
        buffer.lastMessage = await buffer.channel.send(chunk);
      }
      buffer.lastSentAt = Date.now();
    } catch (error: any) {
      console.error("[session-manager] Failed to send message:", error.message);
    }
  }

  setDiscordClient(client: Client): void {
    this.discordClient = client;
  }

  private queueSave(): void {
    this.saveQueue = this.saveQueue.then(() => {
      const state: SessionsState = {};
      for (const [name, session] of this.sessions) {
        state[name] = {
          sessionId: session.sessionId,
          lastActiveChannel: session.lastActiveChannel,
          lastActivity: new Date().toISOString(),
        };
      }
      // Keep closed sessions for resume
      for (const [name, saved] of Object.entries(this.savedSessions)) {
        if (!state[name]) state[name] = saved;
      }
      saveSessions(state);
    });
  }

  async sendMessage(
    projectName: string,
    project: ProjectConfig,
    text: string,
    channel: TextChannel,
  ): Promise<void> {
    if (!this.opencodeClient) {
      await channel.send("❌ OpenCode SDK not initialized");
      return;
    }

    let session = this.sessions.get(projectName);

    // Update last active channel
    if (session) {
      session.lastActiveChannel = channel.id;
      session.lastActivityAt = Date.now();
      this.resetIdleTimer(projectName);
      this.queueSave();
    }

    // Get or create OpenCode session
    let opencodeSessionId: string;
    const savedSession = this.savedSessions[projectName];

    if (session) {
      opencodeSessionId = session.sessionId;
    } else if (savedSession) {
      // 嘗試恢復 session
      try {
        await this.opencodeClient.session.get({
          path: { id: savedSession.sessionId },
        });
        opencodeSessionId = savedSession.sessionId;
        console.log(`[session-manager] Resumed session ${opencodeSessionId} for ${projectName}`);
      } catch {
        // Session 不存在,建立新的
        const result = await this.opencodeClient.session.create({
          body: {
            title: `Discord: ${projectName}`,
            directory: project.path,
          },
        });
        if (!result.data?.id) {
          await channel.send("❌ Failed to create session");
          return;
        }
        opencodeSessionId = result.data.id;
        console.log(`[session-manager] Created new session ${opencodeSessionId} for ${projectName}`);
      }
    } else {
      // 建立新 session
      try {
        const result = await this.opencodeClient.session.create({
          body: {
            title: `Discord: ${projectName}`,
            directory: project.path,
          },
        });
        if (!result.data?.id) {
          await channel.send("❌ Failed to create session");
          return;
        }
        opencodeSessionId = result.data.id;
        console.log(`[session-manager] Created new session ${opencodeSessionId} for ${projectName}`);
      } catch (error: any) {
        await channel.send(`❌ Session creation failed: ${error.message}`);
        return;
      }
    }

    // Register session if new
    if (!session) {
      const idleTimer = setTimeout(
        () => this.closeSession(projectName),
        this.idleTimeoutMs,
      );
      const abortController = new AbortController();
      
      session = {
        projectName,
        sessionId: opencodeSessionId,
        lastActiveChannel: channel.id,
        abortController,
        idleTimer,
        autoApproved: new Set<string>(),
        lastActivityAt: Date.now(),
        sendLock: Promise.resolve(),
      };
      this.sessions.set(projectName, session);
      this.queueSave();
    }

    // Serialize sends per project
    const prevLock = session.sendLock;
    let unlock: (() => void) | undefined;
    session.sendLock = new Promise<void>((resolve) => { unlock = resolve; });
    await prevLock;

    try {
      await channel.sendTyping();

      // 使用 prompt API 發送訊息
      // 回應會透過事件監聽器自動處理
      await this.opencodeClient.session.prompt({
        path: { id: opencodeSessionId },
        body: {
          parts: [{ type: "text", text }],
        },
      });

    } catch (err: any) {
      if (err.name === "AbortError") return;
      await channel.send(`❌ Session error: ${err.message}`);
      console.error(`[session-manager] Error for project ${projectName}:`, err);
    } finally {
      unlock!();
      this.resetIdleTimer(projectName);
    }
  }

  private resetIdleTimer(projectName: string): void {
    const session = this.sessions.get(projectName);
    if (!session) return;
    clearTimeout(session.idleTimer);
    session.idleTimer = setTimeout(
      () => this.closeSession(projectName),
      this.idleTimeoutMs,
    );
  }

  async closeSession(projectName: string): Promise<void> {
    const session = this.sessions.get(projectName);
    if (!session) return;

    clearTimeout(session.idleTimer);
    session.abortController.abort();

    this.savedSessions[projectName] = {
      sessionId: session.sessionId,
      lastActiveChannel: session.lastActiveChannel,
      lastActivity: new Date().toISOString(),
    };
    this.sessions.delete(projectName);
    this.queueSave();
    
    console.log(`[session-manager] Closed session for ${projectName}`);
  }

  async closeAll(): Promise<void> {
    const names = [...this.sessions.keys()];
    await Promise.all(names.map((n) => this.closeSession(n)));
    
    // 停止事件監聽
    this.eventProcessing = false;
    
    // 關閉 OpenCode server
    if (this.opencodeServer) {
      this.opencodeServer.close();
      console.log("[session-manager] OpenCode server closed");
    }
  }

  getActiveSessions(): Array<{
    projectName: string;
    lastActiveChannel: string;
    idleMinutes: number;
  }> {
    const now = Date.now();
    return [...this.sessions.entries()].map(([name, s]) => ({
      projectName: name,
      lastActiveChannel: s.lastActiveChannel,
      idleMinutes: Math.round((now - s.lastActivityAt) / 60000),
    }));
  }

  hasSession(projectName: string): boolean {
    return this.sessions.has(projectName);
  }

  async clearSession(projectName: string): Promise<void> {
    const session = this.sessions.get(projectName);
    
    // 刪除 OpenCode session
    if (session && this.opencodeClient) {
      try {
        await this.opencodeClient.session.delete({
          path: { id: session.sessionId },
        });
        console.log(`[session-manager] Deleted session ${session.sessionId}`);
      } catch (error: any) {
        console.error(`[session-manager] Failed to delete session:`, error.message);
      }
    }
    
    await this.closeSession(projectName);
    delete this.savedSessions[projectName];
    this.queueSave();
  }
}
