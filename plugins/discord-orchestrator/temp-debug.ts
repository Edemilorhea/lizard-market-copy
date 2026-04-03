import { readFileSync, writeFileSync } from 'fs';

const file = 'src/bot.ts';
let content = readFileSync(file, 'utf-8');

// 在 handleMessage 的 if (msg.author.bot) return; 之後加入 debug
const oldLine = '    if (msg.author.bot) return;\n\n    const channelId = msg.channel.id;';
const newLine = `    if (msg.author.bot) return;

    console.log(\`[orchestrator] Received message in channel \${msg.channel.id} from \${msg.author.tag}\`);

    const channelId = msg.channel.id;`;

content = content.replace(oldLine, newLine);
writeFileSync(file, content);
console.log('Debug logging added!');
