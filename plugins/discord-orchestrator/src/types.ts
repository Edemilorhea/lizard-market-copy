export interface ProjectConfig {
  name: string;
  path: string;
  channels: string[];
  model?: string; // Optional: 專案使用的模型
  agent?: string; // Optional: 專案使用的 Agent (OpenAgent, OpenCoder)
}

export interface OrchestratorConfig {
  projects: Record<string, ProjectConfig>;
  ops_channel: string;
  ops_model?: string; // Optional: Ops 使用的模型
  idle_timeout_ms: number;
}

export interface SessionState {
  sessionId: string;
  lastActiveChannel: string;
  lastActivity: string;
}

export interface SessionsState {
  [projectName: string]: SessionState;
}

export interface ActiveSession {
  projectName: string;
  sessionId: string;
  lastActiveChannel: string;
  abortController: AbortController;
  idleTimer: ReturnType<typeof setTimeout>;
  autoApproved: Set<string>;
  lastActivityAt: number;
  sendLock: Promise<void>;
}
