import { readFileSync, writeFileSync } from 'fs';

const file = 'src/model-commands.ts';
let content = readFileSync(file, 'utf-8');

// 更新 help 訊息
const oldHelp = `      return \`🤖 **模型管理指令:**

\\`/model\\` - 顯示當前模型設定
\\`/model list\\` - 列出所有可用模型
\\`/model ops <model-id>\\` - 切換 Ops 模式使用的模型
\\`/model project <project-name> <model-id>\\` - 切換專案使用的模型
\\`/model help\\` - 顯示此說明

**範例:**
\\`/model ops anthropic/claude-opus-4-20250514\\`
\\`/model project my-app anthropic/claude-haiku-4-20250514\\`\`;`;

const newHelp = `      return \`🤖 **模型管理指令:**

\\`/model\\` - 顯示當前模型設定
\\`/model list\\` - 列出所有可用模型
\\`/model ops <model-id>\\` - 切換 Ops 模式使用的模型
\\`/model project <project-name> <model-id>\\` - 切換專案使用的模型
\\`/model help\\` - 顯示此說明

**範例:**
\\`/model ops anthropic/claude-opus-4-20250514\\`
\\`/model ops github-copilot/claude-sonnet-4.5\\`
\\`/model project my-app github-copilot/o1-preview\\`

💎 **GitHub Copilot 訂閱用戶可使用 \\`github-copilot/*\\` 模型!**\`;`;

content = content.replace(oldHelp, newHelp);
writeFileSync(file, content);
console.log('Help updated!');
