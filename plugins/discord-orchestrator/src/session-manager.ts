import { createOpencode, type OpencodeClient } from '@opencode-ai/sdk/v2';
import type { Client, TextChannel, Message } from 'discord.js';
import type { ActiveSession, ProjectConfig, SessionsState } from './types';
import { loadSessions, saveSessions } from './config';
import { postApprovalAndWait } from './approval';

export class SessionManager {
  private sessions = new Map<string, ActiveSession>();
  private savedSessions: SessionsState;
  private idleTimeoutMs: number;
  private saveQueue: Promise<void> = Promise.resolve();
  private discordClient: Client | null = null;
  private opencodeClient: OpencodeClient | null = null;
  private opencodeServer: { url: string; close(): void } | null = null;
  private eventProcessing = false;
  private thinkingMessages = new Map<string, Message>();

  constructor(idleTimeoutMs: number) {
    this.idleTimeoutMs = idleTimeoutMs;
    this.savedSessions = loadSessions();
  }

  async initialize(): Promise<void> {
    console.log('[session-manager] Initializing OpenCode SDK...');
    try {
      const { client, server } = await createOpencode({
        hostname: '127.0.0.1',
        port: 0,
        config: { model: 'anthropic/claude-sonnet-4-6' },
      });
      this.opencodeClient = client;
      this.opencodeServer = server;
      console.log(`[session-manager] OpenCode server started at ${server.url}`);
      this.startEventListener();
    } catch (error: any) {
      console.error('[session-manager] Failed to initialize OpenCode SDK:', error.message);
      throw error;
    }
  }

  private async startEventListener(): Promise<void> {
    if (!this.opencodeClient || this.eventProcessing) return;
    console.log('[session-manager] Starting global event listener...');
    this.eventProcessing = true;

    try {
      const events = await this.opencodeClient.event.subscribe();
      const messageBuffers = new Map<string, { text: string; lastSentAt: number; lastMessage: Message | null; channel: TextChannel | null; }>();

      for await (const event of events.stream) {
        if (!this.eventProcessing) break;
        const sessionId = (event as any).properties?.sessionID;
        const projectSession = sessionId ? Array.from(this.sessions.values()).find(s => s.sessionId === sessionId) : null;
        if (sessionId && !projectSession) continue;

        console.log(`[session-manager] Event: ${event.type}${projectSession ? ` for ${projectSession.projectName}` : ''}`, JSON.stringify((event as any).properties || {}).slice(0, 200));

        switch (event.type) {
          case 'session.status': {
            if (!projectSession || !this.discordClient) break;
            const statusObj = (event as any).properties?.status;
const status = typeof statusObj === 'string' ? statusObj : statusObj?.type;
console.log(`[session-manager] Status value: ${status}`);
            try {
              const channel = await this.discordClient.channels.fetch(projectSession.lastActiveChannel) as TextChannel;
              if (status === 'busy' && !this.thinkingMessages.has(sessionId)) {
                const msg = await channel.send(`🤔 **${projectSession.projectName}** 思考中...`);
                this.thinkingMessages.set(sessionId, msg);
                await channel.sendTyping();
              } else if (status === 'idle' && this.thinkingMessages.has(sessionId)) {
                const msg = this.thinkingMessages.get(sessionId);
                if (msg) try { await msg.delete(); } catch {}
                this.thinkingMessages.delete(sessionId);
              }
            } catch (e: any) { console.error('[session-manager] status error:', e.message); }
            break;
          }

          case 'permission.asked': {
            if (!projectSession || !this.discordClient) break;
            const props = (event as any).properties;
            try {
              const channel = await this.discordClient.channels.fetch(projectSession.lastActiveChannel) as TextChannel;
              const thinkingMsg = this.thinkingMessages.get(sessionId);
              if (thinkingMsg) try { await thinkingMsg.edit(`🔐 **${projectSession.projectName}** 等待權限確認...`); } catch {}

              if (projectSession.autoApproved.has(props.permission)) {
                await this.opencodeClient!.permission.reply({ requestID: props.id, reply: 'once' });
              } else {
                const result = await postApprovalAndWait(channel, props.permission || 'Unknown', props.metadata || {}, 60_000);
                console.log(`[session-manager] Permission result:`, result);
                const reply = result.decision === 'allow' ? (result.autoApprove ? 'always' : 'once') : 'reject';
                console.log(`[session-manager] Sending permission reply: ${reply} for ${props.id}`);
                await this.opencodeClient!.permission.reply({ requestID: props.id, reply });
                console.log(`[session-manager] Permission reply sent successfully`);
                if (result.autoApprove) projectSession.autoApproved.add(props.permission);
              }

              if (thinkingMsg) try { await thinkingMsg.edit(`🤔 **${projectSession.projectName}** 思考中...`); } catch {}
            } catch (e: any) { console.error('[session-manager] permission error:', e.message); }
            break;
          }

          case 'message.part.delta': {
            if (!projectSession || !this.discordClient) break;
            const props = (event as any).properties;
            // Support both old format (props.part.text) and new format (props.delta with props.field === 'text')
            const deltaText = props?.delta || (props?.part?.type === 'text' ? props?.part?.text : null);
            const isTextDelta = props?.field === 'text' || props?.part?.type === 'text';
            if (isTextDelta && deltaText) {
              console.log(`[session-manager] Delta text received: ${deltaText.slice(0, 50)}...`);
              if (!messageBuffers.has(sessionId)) {
                try {
                  const channel = await this.discordClient.channels.fetch(projectSession.lastActiveChannel) as TextChannel;
                  messageBuffers.set(sessionId, { text: '', lastSentAt: 0, lastMessage: null, channel });
                } catch { break; }
              }
              const buffer = messageBuffers.get(sessionId)!;
              buffer.text += deltaText;
              const now = Date.now();
              if ((now - buffer.lastSentAt >= 2000 && buffer.text.length > 0) || buffer.text.length >= 1500) {
                await this.flushBuffer(buffer);
              }
            }
            break;
          }

          case 'message.updated': {
            if (!projectSession) break;
            const props = (event as any).properties;
            if (props?.info?.role === 'assistant' || props?.message?.role === 'assistant') {
              const buffer = messageBuffers.get(sessionId);
              if (buffer && buffer.text.length > 0) await this.flushBuffer(buffer);
              messageBuffers.delete(sessionId);
            }
            break;
          }

          case 'session.error': {
            if (!projectSession || !this.discordClient) break;
            const props = (event as any).properties;
            try {
              const channel = await this.discordClient.channels.fetch(projectSession.lastActiveChannel) as TextChannel;
              await channel.send(`❌ Session error: ${props?.error || 'Unknown error'}`);
            } catch {}
            const msg = this.thinkingMessages.get(sessionId);
            if (msg) try { await msg.delete(); } catch {}
            this.thinkingMessages.delete(sessionId);
            messageBuffers.delete(sessionId);
            break;
          }
        }
      }
    } catch (error: any) {
      console.error('[session-manager] Event listener error:', error.message);
      this.eventProcessing = false;
    }
  }

  private async flushBuffer(buffer: { text: string; lastSentAt: number; lastMessage: Message | null; channel: TextChannel | null; }): Promise<void> {
    if (!buffer.channel || buffer.text.length === 0) return;
    try {
      while (buffer.text.length > 0) {
        const chunk = buffer.text.slice(0, 2000);
        buffer.text = buffer.text.slice(2000);
        buffer.lastMessage = await buffer.channel.send(chunk);
      }
      buffer.lastSentAt = Date.now();
    } catch (e: any) { console.error('[session-manager] Failed to send message:', e.message); }
  }

  setDiscordClient(client: Client): void { this.discordClient = client; }

  private queueSave(): void {
    this.saveQueue = this.saveQueue.then(() => {
      const state: SessionsState = {};
      for (const [name, session] of this.sessions) {
        state[name] = { sessionId: session.sessionId, lastActiveChannel: session.lastActiveChannel, lastActivity: new Date().toISOString() };
      }
      for (const [name, saved] of Object.entries(this.savedSessions)) {
        if (!state[name]) state[name] = saved;
      }
      saveSessions(state);
    });
  }

  async sendMessage(projectName: string, project: ProjectConfig, text: string, channel: TextChannel): Promise<void> {
    if (!this.opencodeClient) { await channel.send('❌ OpenCode SDK not initialized'); return; }

    let session = this.sessions.get(projectName);
    if (session) {
      session.lastActiveChannel = channel.id;
      session.lastActivityAt = Date.now();
      this.resetIdleTimer(projectName);
      this.queueSave();
    }

    let opencodeSessionId: string;
    const savedSession = this.savedSessions[projectName];

    if (session) {
      opencodeSessionId = session.sessionId;
    } else if (savedSession) {
      try {
        await this.opencodeClient.session.get({ sessionID: savedSession.sessionId });
        opencodeSessionId = savedSession.sessionId;
        console.log(`[session-manager] Resumed session ${opencodeSessionId} for ${projectName}`);
      } catch {
        const result = await this.opencodeClient.session.create({ title: `Discord: ${projectName}`, directory: project.path });
        if (!result.data?.id) { await channel.send('❌ Failed to create session'); return; }
        opencodeSessionId = result.data.id;
        console.log(`[session-manager] Created new session ${opencodeSessionId} for ${projectName}`);
      }
    } else {
      try {
        const result = await this.opencodeClient.session.create({ title: `Discord: ${projectName}`, directory: project.path });
        if (!result.data?.id) { await channel.send('❌ Failed to create session'); return; }
        opencodeSessionId = result.data.id;
        console.log(`[session-manager] Created new session ${opencodeSessionId} for ${projectName}`);
      } catch (error: any) { await channel.send(`❌ Session creation failed: ${error.message}`); return; }
    }

    if (!session) {
      const idleTimer = setTimeout(() => this.closeSession(projectName), this.idleTimeoutMs);
      session = {
        projectName, sessionId: opencodeSessionId, lastActiveChannel: channel.id,
        abortController: new AbortController(), idleTimer,
        autoApproved: new Set<string>(), lastActivityAt: Date.now(), sendLock: Promise.resolve(),
      };
      this.sessions.set(projectName, session);
      this.queueSave();
    }

    const prevLock = session.sendLock;
    let unlock: (() => void) | undefined;
    session.sendLock = new Promise<void>((resolve) => { unlock = resolve; });
    await prevLock;

    try {
      await this.opencodeClient.session.promptAsync({ sessionID: opencodeSessionId, parts: [{ type: 'text', text }] });
    } catch (err: any) {
      if (err.name === 'AbortError') return;
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
    session.idleTimer = setTimeout(() => this.closeSession(projectName), this.idleTimeoutMs);
  }

  async closeSession(projectName: string): Promise<void> {
    const session = this.sessions.get(projectName);
    if (!session) return;
    clearTimeout(session.idleTimer);
    session.abortController.abort();
    const msg = this.thinkingMessages.get(session.sessionId);
    if (msg) try { await msg.delete(); } catch {}
    this.thinkingMessages.delete(session.sessionId);
    this.savedSessions[projectName] = { sessionId: session.sessionId, lastActiveChannel: session.lastActiveChannel, lastActivity: new Date().toISOString() };
    this.sessions.delete(projectName);
    this.queueSave();
    console.log(`[session-manager] Closed session for ${projectName}`);
  }

  async closeAll(): Promise<void> {
    const names = [...this.sessions.keys()];
    await Promise.all(names.map((n) => this.closeSession(n)));
    this.eventProcessing = false;
    if (this.opencodeServer) { this.opencodeServer.close(); console.log('[session-manager] OpenCode server closed'); }
  }

  getActiveSessions(): Array<{ projectName: string; lastActiveChannel: string; idleMinutes: number; }> {
    const now = Date.now();
    return [...this.sessions.entries()].map(([name, s]) => ({ projectName: name, lastActiveChannel: s.lastActiveChannel, idleMinutes: Math.round((now - s.lastActivityAt) / 60000) }));
  }

  hasSession(projectName: string): boolean { return this.sessions.has(projectName); }

  async abortSession(projectName: string): Promise<void> {
    const session = this.sessions.get(projectName);
    if (!session) {
      console.log(`[session-manager] No active session for ${projectName}`);
      return;
    }
    
    console.log(`[session-manager] Aborting session for ${projectName}`);
    
    // Abort any pending operations
    session.abortController.abort();
    
    // Delete thinking message if present
    const msg = this.thinkingMessages.get(session.sessionId);
    if (msg) {
      try { await msg.delete(); } catch {}
      this.thinkingMessages.delete(session.sessionId);
    }
    
    // Try to cancel the session in OpenCode
    if (this.opencodeClient) {
      try {
        await this.opencodeClient.session.abort({ sessionID: session.sessionId });
        console.log(`[session-manager] Aborted OpenCode session ${session.sessionId}`);
      } catch (e: any) {
        console.log(`[session-manager] Could not cancel session: ${e.message}`);
      }
    }
    
    // Close the session
    await this.closeSession(projectName);
  }

  async clearSession(projectName: string): Promise<void> {
    const session = this.sessions.get(projectName);
    if (session && this.opencodeClient) {
      try {
        await this.opencodeClient.session.delete({ sessionID: session.sessionId });
        console.log(`[session-manager] Deleted session ${session.sessionId}`);
      } catch (e: any) { console.error('[session-manager] Failed to delete session:', e.message); }
    }
    await this.closeSession(projectName);
    delete this.savedSessions[projectName];
    this.queueSave();
  }
}
