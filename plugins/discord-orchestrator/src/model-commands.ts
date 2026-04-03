/**
 * 處理模型相關指令
 */

import { loadConfig, saveConfig } from "./config";
import { isValidModel, formatModelList, DEFAULT_MODEL } from "./model-manager";

export function parseModelCommand(content: string): {
  action: "list" | "show" | "set-ops" | "set-project" | "help" | null;
  projectName?: string;
  modelId?: string;
} {
  const trimmed = content.trim();
  
  // /model list - 列出所有模型
  if (trimmed === "/model list") {
    return { action: "list" };
  }
  
  // /model - 顯示當前模型
  if (trimmed === "/model") {
    return { action: "show" };
  }
  
  // /model help - 說明
  if (trimmed === "/model help") {
    return { action: "help" };
  }
  
  // /model ops <model-id> - 切換 Ops 模型
  const opsMatch = trimmed.match(/^\/model\s+ops\s+(.+)$/);
  if (opsMatch) {
    return { action: "set-ops", modelId: opsMatch[1].trim() };
  }
  
  // /model project <project-name> <model-id> - 切換專案模型
  const projectMatch = trimmed.match(/^\/model\s+project\s+(\S+)\s+(.+)$/);
  if (projectMatch) {
    return {
      action: "set-project",
      projectName: projectMatch[1],
      modelId: projectMatch[2].trim(),
    };
  }
  
  return { action: null };
}

export function handleModelCommand(content: string): string | null {
  const parsed = parseModelCommand(content);
  
  if (!parsed.action) return null;
  
  const config = loadConfig();
  
  switch (parsed.action) {
    case "list":
      return formatModelList();
      
    case "show": {
      let output = "📊 **目前模型設定:**\n\n";
      output += `**Ops 模式:** \`${config.ops_model || DEFAULT_MODEL}\`\n\n`;
      
      const projectCount = Object.keys(config.projects).length;
      if (projectCount === 0) {
        output += "**專案:** 無任何專案\n";
      } else {
        output += "**專案:**\n";
        for (const [name, project] of Object.entries(config.projects)) {
          output += `- \`${name}\`: \`${project.model || DEFAULT_MODEL}\`\n`;
        }
      }
      
      return output;
    }
      
    case "set-ops": {
      const modelId = parsed.modelId!;
      if (!isValidModel(modelId)) {
        return `❌ 無效的模型 ID: \`${modelId}\`\n\n使用 \`/model list\` 查看可用模型。`;
      }
      
      config.ops_model = modelId;
      saveConfig(config);
      
      return `✅ Ops 模型已切換為 \`${modelId}\`\n\n**注意:** 需要重啟 Bot 才會生效。`;
    }
      
    case "set-project": {
      const { projectName, modelId } = parsed;
      if (!projectName || !modelId) {
        return "❌ 指令格式錯誤。\n\n範例: `/model project my-project anthropic/claude-opus-4-20250514`";
      }
      
      if (!config.projects[projectName]) {
        return `❌ 專案 \`${projectName}\` 不存在。\n\n使用 \`/model\` 查看現有專案。`;
      }
      
      if (!isValidModel(modelId)) {
        return `❌ 無效的模型 ID: \`${modelId}\`\n\n使用 \`/model list\` 查看可用模型。`;
      }
      
      config.projects[projectName].model = modelId;
      saveConfig(config);
      
      return `✅ 專案 \`${projectName}\` 的模型已切換為 \`${modelId}\`\n\n**注意:** 需要重啟 Bot 或重新建立 session 才會生效。`;
    }
      
    case "help":
      return `🤖 **模型管理指令:**

\`/model\` - 顯示當前模型設定
\`/model list\` - 列出所有可用模型
\`/model ops <model-id>\` - 切換 Ops 模式使用的模型
\`/model project <project-name> <model-id>\` - 切換專案使用的模型
\`/model help\` - 顯示此說明

**範例:**
\`/model ops anthropic/claude-opus-4-20250514\`
\`/model ops github-copilot/claude-sonnet-4.5\`
\`/model project my-app github-copilot/o1-preview\`

💎 **GitHub Copilot 訂閱用戶可使用 \`github-copilot/*\` 模型!**`;
      
    default:
      return null;
  }
}
