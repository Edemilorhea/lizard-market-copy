/**
 * Status command handler
 * Formats session status and todo information for Discord
 */

export interface SessionStatusInfo {
  status: 'idle' | 'busy' | 'retry' | 'unknown';
  todos: Array<{
    content: string;
    status: string;
    priority: string;
  }>;
}

export function formatSessionStatus(
  projectName: string,
  statusInfo: SessionStatusInfo
): string {
  const lines: string[] = [];
  
  lines.push(`📊 **${projectName} - Session Status**`);
  lines.push('');
  
  const statusEmoji = {
    idle: '💤',
    busy: '⚠️',
    retry: '💄',
    unknown: '❓',
  }[statusInfo.status] || '❓';
  
  lines.push(`**Status:** ${statusEmoji} ${statusInfo.status}`);
  lines.push('');
  
  if (statusInfo.todos.length === 0) {
    lines.push('**Tasks:** No tasks');
  } else {
    const completed = statusInfo.todos.filter(t => t.status === 'completed').length;
    const inProgress = statusInfo.todos.filter(t => t.status === 'in_progress').length;
    const pending = statusInfo.todos.filter(t => t.status === 'pending').length;
    const total = statusInfo.todos.length;
    
    lines.push(`**Tasks:** ${completed}/${total} completed`);
    
    if (inProgress > 0) {
      lines.push('');
      lines.push('**💄 In Progress:**');
      statusInfo.todos
        .filter(t => t.status === 'in_progress')
        .slice(0, 5)
        .forEach(todo => {
          const priorityEmoji = todo.priority === 'high' ? '🔴' : todo.priority === 'medium' ? '🟡' : '🟢';
          lines.push(`${priorityEmoji} ${todo.content}`);
        });
    }
    
    if (pending > 0) {
      lines.push('');
      lines.push(`**⁳ Pending:** ${pending} task(s)`);
    }
  }
  
  return lines.join('\n');
}

