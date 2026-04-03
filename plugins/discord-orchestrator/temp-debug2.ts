import { readFileSync, writeFileSync } from 'fs';

const file = 'src/bot.ts';
let content = readFileSync(file, 'utf-8');

// 在 Ops channel 判斷加入 debug
const oldLine = '    // Ops channel — delegate to registered handler\n    if (channelId === this.config.ops_channel) {';
const newLine = `    // Ops channel — delegate to registered handler
    if (channelId === this.config.ops_channel) {
      console.log('[orchestrator] Message is for Ops channel, delegating to opsHandler');`;

content = content.replace(oldLine, newLine);
writeFileSync(file, content);
console.log('Ops debug logging added!');
