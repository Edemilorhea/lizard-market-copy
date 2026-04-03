/**
 * Agent command handler
 * Manages agent settings for projects
 */

import { loadConfig, saveConfig } from "./config";

// Available agents
export const AVAILABLE_AGENTS = ["OpenAgent", "OpenCoder"] as const;
export type AgentType = typeof AVAILABLE_AGENTS[number];

export function isValidAgent(agent: string): agent is AgentType {
  return AVAILABLE_AGENTS.includes(agent as AgentType);
}

export function parseAgentCommand(content: string): {
  action: "list" | "show" | "set" | "help" | null;
  projectName?: string;
  agentName?: string;
} {
  const trimmed = content.trim();
  
  // /agent list - list available agents
  if (trimmed === "/agent list") {
    return { action: "list" };
  }
  
  // /agent - show current agent settings
  if (trimmed === "/agent") {
    return { action: "show" };
  }
  
  // /agent help
  if (trimmed === "/agent help") {
    return { action: "help" };
  }
  
  // /agent <project> <agent-name>
  const setMatch = trimmed.match(/^\/agent\s+(\S+)\s+(\S+)$/i);
  if (setMatch) {
    return { action: "set", projectName: setMatch[1], agentName: setMatch[2] };
  }
  
  return { action: null };
}

export function handleAgentCommand(content: string): string | null {
  const parsed = parseAgentCommand(content);
  
  if (!parsed.action) return null;
  
  const config = loadConfig();
  
  switch (parsed.action) {
    case "list":
      return `🤖 **可用的 Agents:**

**OpenAgent** - 通用 agent，適合任何任務
**OpenCoder** - 專門寫程式的 agent，更精確的程式碼生成

使用 \`/agent <project> <agent>\` 來設定專案的 agent`;

    case "show": {
      let output = "🤖 **目前 Agent 設定:**\n\n";
      
      const projectCount = Object.keys(config.projects).length;
      if (projectCount === 0) {
        output += "**專案:** 無任何專案\n";
      } else {
        output += "**專案:**\n";
        for (const [name, project] of Object.entries(config.projects)) {
          const agent = project.agent || "OpenAgent (預設)";
          output += `- \`${name}\`: **${agent}**\n`;
        }
      }
      
      return output;
    }

    case "set": {
      const { projectName, agentName } = parsed;
      if (!projectName || !agentName) {
        return "❌ 指令格式錯誤。\n\n範例: `/agent my-project OpenCoder`";
      }
      
      if (!config.projects[projectName]) {
        return `❌ 專案 \`${projectName}\` 不存在。\n\n使用 \`/agent\` 查看現有專案。`;
      }
      
      // Case-insensitive match for agent names
      const matchedAgent = AVAILABLE_AGENTS.find(
        a => a.toLowerCase() === agentName.toLowerCase()
      );
      
      if (!matchedAgent) {
        return `❌ 無效的 Agent: \`${agentName}\`\n\n可用的 Agents: ${AVAILABLE_AGENTS.join(", ")}\n\n使用 \`/agent list\` 查看詳情。`;
      }
      
      config.projects[projectName].agent = matchedAgent;
      saveConfig(config);
      
      return `✅ 專案 \`${projectName}\` 的 Agent 已切換為 **${matchedAgent}**\n\n**注意:** 需要重新建立 session 才會生效（輸入 \`!stop\` 後重新發送訊息）。`;
    }

    case "help":
      return `🤖 **Agent 管理指令:**

\`/agent\` - 顯示目前 agent 設定
\`/agent list\` - 列出所有可用 agents
\`/agent <project> <agent>\` - 設定專案使用的 agent
\`/agent help\` - 顯示此說明

**可用的 Agents:**
- \`OpenAgent\` - 通用 agent (預設)
- \`OpenCoder\` - 程式碼專用 agent

**範例:**
\`/agent my-project OpenCoder\``;

    default:
      return null;
  }
}
