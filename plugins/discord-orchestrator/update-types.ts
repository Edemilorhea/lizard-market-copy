import { readFileSync, writeFileSync } from 'fs';

const file = 'src/types.ts';
let content = readFileSync(file, 'utf-8');

// 在 ProjectConfig 加入 model
content = content.replace(
  `export interface ProjectConfig {
  name: string;
  path: string;
  channels: string[];
}`,
  `export interface ProjectConfig {
  name: string;
  path: string;
  channels: string[];
  model?: string; // Optional: 專案使用的模型
}`
);

// 在 OrchestratorConfig 加入 ops_model
content = content.replace(
  `export interface OrchestratorConfig {
  projects: Record<string, ProjectConfig>;
  ops_channel: string;
  idle_timeout_ms: number;
}`,
  `export interface OrchestratorConfig {
  projects: Record<string, ProjectConfig>;
  ops_channel: string;
  ops_model?: string; // Optional: Ops 使用的模型
  idle_timeout_ms: number;
}`
);

writeFileSync(file, content);
console.log('Types updated!');
