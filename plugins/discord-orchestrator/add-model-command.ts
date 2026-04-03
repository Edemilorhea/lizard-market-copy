import { readFileSync, writeFileSync } from 'fs';

const file = 'server.ts';
let content = readFileSync(file, 'utf-8');

// 在 import 區域加入 model-commands
const importLine = 'import type { TextChannel, Message } from "discord.js";';
const newImport = `import type { TextChannel, Message } from "discord.js";
import { handleModelCommand } from "./src/model-commands";`;

content = content.replace(importLine, newImport);

// 在 Ops handler 開頭加入指令檢查
const handlerStart = 'bot.onOpsMessage(async (msg: Message) => {';
const newHandlerStart = `bot.onOpsMessage(async (msg: Message) => {
  // 處理模型指令
  if (msg.content.startsWith('/model')) {
    const channel = msg.channel as TextChannel;
    const response = handleModelCommand(msg.content);
    if (response) {
      await channel.send(response);
      return;
    }
  }
`;

content = content.replace(handlerStart, newHandlerStart);

writeFileSync(file, content);
console.log('Model command handler added!');
