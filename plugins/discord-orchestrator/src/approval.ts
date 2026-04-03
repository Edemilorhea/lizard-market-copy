import type { TextChannel, Message } from 'discord.js';

const APPROVE = '✅';
const DENY = '❌';
const ALWAYS = '🔒';
const INPUT_TRUNCATE = 1500;

export interface ApprovalResult {
  decision: 'allow' | 'deny';
  autoApprove: boolean;
}

export interface PermissionInfo {
  permission: string;
  patterns?: string[];
  metadata?: Record<string, unknown>;
  tool?: { messageID: string; callID: string };
}

function formatPermissionDetails(info: PermissionInfo): string {
  const lines: string[] = [];
  
  lines.push('Permission: ' + info.permission);
  
  if (info.patterns && info.patterns.length > 0) {
    lines.push('');
    lines.push('Patterns:');
    for (const pattern of info.patterns.slice(0, 10)) {
      lines.push('  • ' + pattern);
    }
    if (info.patterns.length > 10) {
      lines.push('  ... and ' + (info.patterns.length - 10) + ' more');
    }
  }
  
  if (info.metadata && Object.keys(info.metadata).length > 0) {
    const metaStr = JSON.stringify(info.metadata, null, 2);
    if (metaStr !== '{}') {
      lines.push('');
      lines.push('Details:');
      lines.push(metaStr);
    }
  }
  
  const result = lines.join('\n');
  if (result.length > INPUT_TRUNCATE) {
    return result.slice(0, INPUT_TRUNCATE) + '\n... (truncated)';
  }
  return result;
}

export async function postApprovalAndWait(
  channel: TextChannel,
  permissionOrToolName: string,
  inputOrInfo: unknown,
  timeoutMs = 60_000,
): Promise<ApprovalResult> {
  let displayStr: string;
  let title: string;
  
  if (typeof inputOrInfo === 'object' && inputOrInfo !== null && 'permission' in inputOrInfo) {
    const info = inputOrInfo as PermissionInfo;
    displayStr = formatPermissionDetails(info);
    title = '🔐 Permission Request: ' + info.permission;
  } else {
    const info: PermissionInfo = {
      permission: permissionOrToolName,
      metadata: inputOrInfo as Record<string, unknown>,
    };
    displayStr = formatPermissionDetails(info);
    title = '🔐 Permission Request: ' + permissionOrToolName;
  }

  const codeBlock = '```\n' + displayStr + '\n```';

  const msg: Message = await channel.send({
    embeds: [
      {
        title,
        description: codeBlock,
        color: 0xffa500,
        footer: {
          text: APPROVE + ' Allow  ' + DENY + ' Deny  ' + ALWAYS + ' Always allow this tool | Timeout: ' + Math.round(timeoutMs / 1000) + 's',
        },
      },
    ],
  });

  await msg.react(APPROVE);
  await msg.react(DENY);
  await msg.react(ALWAYS);

  return new Promise<ApprovalResult>((resolve) => {
    const collector = msg.createReactionCollector({
      filter: (reaction, user) => {
        if (user.bot) return false;
        const emoji = reaction.emoji.name;
        return emoji === APPROVE || emoji === DENY || emoji === ALWAYS;
      },
      max: 1,
      time: timeoutMs,
    });

    collector.on('collect', (reaction) => {
      const emoji = reaction.emoji.name;
      if (emoji === ALWAYS) {
        resolve({ decision: 'allow', autoApprove: true });
      } else if (emoji === APPROVE) {
        resolve({ decision: 'allow', autoApprove: false });
      } else {
        resolve({ decision: 'deny', autoApprove: false });
      }
    });

    collector.on('end', (collected) => {
      if (collected.size === 0) {
        resolve({ decision: 'deny', autoApprove: false });
      }
    });
  });
}
