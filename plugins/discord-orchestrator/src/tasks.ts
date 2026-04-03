/**
 * Tasks persistence module
 * Stores TODO items per channel/project to ~/.discord-orchestrator/tasks.json
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { STATE_DIR, ensureStateDir } from './config';

const TASKS_FILE = join(STATE_DIR, 'tasks.json');

export interface TaskItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'high' | 'medium' | 'low';
  createdAt: string;
  updatedAt: string;
}

export interface ProjectTasks {
  projectName: string;
  channelId: string;
  tasks: TaskItem[];
  lastUpdated: string;
}

export interface TasksState {
  [projectName: string]: ProjectTasks;
}

export function loadTasks(): TasksState {
  ensureStateDir();
  if (!existsSync(TASKS_FILE)) return {};
  try {
    return JSON.parse(readFileSync(TASKS_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

export function saveTasks(tasks: TasksState): void {
  ensureStateDir();
  writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

export function updateProjectTasks(
  projectName: string, 
  channelId: string, 
  tasks: Array<{ content: string; status: string; priority: string }>
): void {
  const allTasks = loadTasks();
  const now = new Date().toISOString();
  
  allTasks[projectName] = {
    projectName,
    channelId,
    tasks: tasks.map(t => ({
      content: t.content,
      status: t.status as TaskItem['status'],
      priority: t.priority as TaskItem['priority'],
      createdAt: allTasks[projectName]?.tasks.find(
        existing => existing.content === t.content
      )?.createdAt || now,
      updatedAt: now,
    })),
    lastUpdated: now,
  };
  
  saveTasks(allTasks);
}

export function getProjectTasks(projectName: string): ProjectTasks | null {
  const allTasks = loadTasks();
  return allTasks[projectName] || null;
}

export function formatTasksStatus(projectName: string): string {
  const projectTasks = getProjectTasks(projectName);
  
  if (!projectTasks || projectTasks.tasks.length === 0) {
    return `📋 **${projectName}** - 沒有待辦任務`;
  }
  
  const tasks = projectTasks.tasks;
  const completed = tasks.filter(t => t.status === 'completed').length;
  const inProgress = tasks.filter(t => t.status === 'in_progress').length;
  const pending = tasks.filter(t => t.status === 'pending').length;
  const total = tasks.length;
  
  const lines: string[] = [];
  lines.push(`📋 **${projectName}** - 任務狀態`);
  lines.push(`進度: ${completed}/${total} 完成`);
  lines.push('');
  
  if (inProgress > 0) {
    lines.push('**🔄 進行中:**');
    tasks.filter(t => t.status === 'in_progress').forEach(t => {
      const emoji = t.priority === 'high' ? '🔴' : t.priority === 'medium' ? '🟡' : '🟢';
      lines.push(`  ${emoji} ${t.content}`);
    });
    lines.push('');
  }
  
  if (pending > 0) {
    lines.push(`**⏳ 待處理:** ${pending} 個任務`);
    tasks.filter(t => t.status === 'pending').slice(0, 3).forEach(t => {
      lines.push(`  • ${t.content}`);
    });
    if (pending > 3) lines.push(`  ... 還有 ${pending - 3} 個`);
    lines.push('');
  }
  
  if (completed > 0) {
    lines.push(`**✅ 已完成:** ${completed} 個任務`);
  }
  
  lines.push('');
  lines.push(`最後更新: ${new Date(projectTasks.lastUpdated).toLocaleString('zh-TW')}`);
  
  return lines.join('\n');
}
