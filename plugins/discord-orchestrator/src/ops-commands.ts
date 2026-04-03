/**
 * Ops channel commands
 * Handles /status, /reload, /tasks, /help commands
 */

import { loadConfig } from './config';
import { formatTasksStatus, getProjectTasks } from './tasks';

export type OpsCommandResult = {
  handled: boolean;
  response?: string;
  action?: 'reload' | 'none';
};

export function parseOpsCommand(content: string): OpsCommandResult {
  const trimmed = content.trim().toLowerCase();
  
  // /help - 顯示可用指令
  if (trimmed === '/help' || trimmed === '/h') {
    return {
      handled: true,
      response: `🤖 **Discord Orchestrator 指令**

**管理指令 (Ops 頻道):**
\`/status\` - 顯示所有專案狀態
\`/status <project>\` - 顯示特定專案狀態
\`/tasks\` - 顯示所有專案待辦任務
\`/tasks <project>\` - 顯示特定專案待辦任務
\`/reload\` - 重新載入設定 (不重啟)
\`/restart\` - 重啟 Bot (需要 PM2)
\`/model ...\` - 模型管理 (輸入 /model help 查看詳情)
\`/help\` - 顯示此說明

**專案頻道指令:**
\`/stop\` 或 \`/abort\` - 停止當前工作

其他訊息會交給 AI 處理。`,
    };
  }
  
  // /status [project] - 顯示狀態
  if (trimmed === '/status') {
    const config = loadConfig();
    const projects = Object.keys(config.projects);
    
    if (projects.length === 0) {
      return { handled: true, response: '📊 目前沒有註冊任何專案' };
    }
    
    const lines = ['📊 **專案狀態總覽**', ''];
    for (const name of projects) {
      const project = config.projects[name];
      const tasks = getProjectTasks(name);
      const taskInfo = tasks 
        ? `${tasks.tasks.filter(t => t.status === 'in_progress').length} 進行中, ${tasks.tasks.filter(t => t.status === 'pending').length} 待處理`
        : '無任務記錄';
      lines.push(`**${name}**`);
      lines.push(`  路徑: ${project.path}`);
      lines.push(`  頻道: ${project.channels.length} 個`);
      lines.push(`  任務: ${taskInfo}`);
      lines.push('');
    }
    
    return { handled: true, response: lines.join('\n') };
  }
  
  // /status <project>
  const statusMatch = trimmed.match(/^\/status\s+(\S+)$/);
  if (statusMatch) {
    const projectName = statusMatch[1];
    const config = loadConfig();
    
    if (!config.projects[projectName]) {
      return { handled: true, response: `❌ 專案 \`${projectName}\` 不存在` };
    }
    
    return { handled: true, response: formatTasksStatus(projectName) };
  }
  
  // /tasks [project] - 顯示任務
  if (trimmed === '/tasks') {
    const config = loadConfig();
    const projects = Object.keys(config.projects);
    
    if (projects.length === 0) {
      return { handled: true, response: '📋 目前沒有註冊任何專案' };
    }
    
    const lines = ['📋 **所有專案任務**', ''];
    for (const name of projects) {
      lines.push(formatTasksStatus(name));
      lines.push('---');
    }
    
    return { handled: true, response: lines.join('\n') };
  }
  
  // /tasks <project>
  const tasksMatch = trimmed.match(/^\/tasks\s+(\S+)$/);
  if (tasksMatch) {
    const projectName = tasksMatch[1];
    const config = loadConfig();
    
    if (!config.projects[projectName]) {
      return { handled: true, response: `❌ 專案 \`${projectName}\` 不存在` };
    }
    
    return { handled: true, response: formatTasksStatus(projectName) };
  }
  
  // /reload - 重新載入設定
  if (trimmed === '/reload') {
    return {
      handled: true,
      response: '🔄 設定已重新載入',
      action: 'reload',
    };
  }
  
  // /restart - 重啟 Bot
  if (trimmed === '/restart') {
    return {
      handled: true,
      response: '🔄 Bot 正在重啟... (請稍候 5-10 秒)',
      action: 'reload', // Will trigger pm2 restart
    };
  }
  
  return { handled: false };
}
