const fs = require('fs');

const content = `/**
 * 模型管理模組
 * 處理模型列表、切換、查詢等功能
 */

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  provider: "anthropic" | "openai" | "google" | "github" | "xai" | "finetuned";
  status?: string; // GA, Preview, Closing down
  requiresSubscription?: string;
}

export const AVAILABLE_MODELS: ModelInfo[] = [
  // ===== Anthropic Models (通用) =====
  {
    id: "anthropic/claude-opus-4-20250514",
    name: "Claude Opus 4",
    description: "最強大的模型,適合複雜任務",
    provider: "anthropic",
    status: "GA",
  },
  {
    id: "anthropic/claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    description: "平衡性能與成本 (預設)",
    provider: "anthropic",
    status: "GA",
  },
  {
    id: "anthropic/claude-sonnet-4",
    name: "Claude Sonnet 4",
    description: "通用版本",
    provider: "anthropic",
    status: "GA",
  },
  {
    id: "anthropic/claude-haiku-4-20250514",
    name: "Claude Haiku 4",
    description: "快速且便宜",
    provider: "anthropic",
    status: "GA",
  },
  
  // ===== OpenAI Models (通用) =====
  {
    id: "openai/gpt-4o",
    name: "GPT-4o",
    description: "OpenAI 多模態模型",
    provider: "openai",
    status: "GA",
  },
  {
    id: "openai/o1",
    name: "OpenAI o1",
    description: "推理專用模型",
    provider: "openai",
    status: "GA",
  },
  {
    id: "openai/gpt-4-turbo",
    name: "GPT-4 Turbo",
    description: "快速版本的 GPT-4",
    provider: "openai",
    status: "GA",
  },
  
  // ===== Google Models (通用) =====
  {
    id: "google/gemini-2.0-flash-exp",
    name: "Gemini 2.0 Flash",
    description: "Google 最新快速模型",
    provider: "google",
    status: "Preview",
  },
  {
    id: "google/gemini-1.5-pro",
    name: "Gemini 1.5 Pro",
    description: "Google 專業級模型",
    provider: "google",
    status: "GA",
  },
  
  // ===== GitHub Copilot Models (需要訂閱) =====
  
  // --- GPT 系列 ---
  {
    id: "github-copilot/gpt-4.1",
    name: "GPT-4.1 (Copilot)",
    description: "GPT-4 改進版",
    provider: "github",
    status: "GA",
    requiresSubscription: "GitHub Copilot",
  },
  {
    id: "github-copilot/gpt-5-mini",
    name: "GPT-5 mini (Copilot)",
    description: "輕量版 GPT-5",
    provider: "github",
    status: "GA",
    requiresSubscription: "GitHub Copilot",
  },
  {
    id: "github-copilot/gpt-5.1",
    name: "GPT-5.1 (Copilot) ⚠️",
    description: "即將下線 (2026-04-15)",
    provider: "github",
    status: "Closing down: 2026-04-15",
    requiresSubscription: "GitHub Copilot",
  },
  {
    id: "github-copilot/gpt-5.2",
    name: "GPT-5.2 (Copilot)",
    description: "GPT-5 改進版",
    provider: "github",
    status: "GA",
    requiresSubscription: "GitHub Copilot",
  },
  {
    id: "github-copilot/gpt-5.2-codex",
    name: "GPT-5.2-Codex (Copilot)",
    description: "專為程式碼優化",
    provider: "github",
    status: "GA",
    requiresSubscription: "GitHub Copilot",
  },
  {
    id: "github-copilot/gpt-5.3-codex",
    name: "GPT-5.3-Codex (Copilot)",
    description: "最新程式碼專用模型",
    provider: "github",
    status: "GA",
    requiresSubscription: "GitHub Copilot",
  },
  {
    id: "github-copilot/gpt-5.4",
    name: "GPT-5.4 (Copilot)",
    description: "最新 GPT-5 版本",
    provider: "github",
    status: "GA",
    requiresSubscription: "GitHub Copilot",
  },
  {
    id: "github-copilot/gpt-5.4-mini",
    name: "GPT-5.4 mini (Copilot)",
    description: "最新輕量版",
    provider: "github",
    status: "GA",
    requiresSubscription: "GitHub Copilot",
  },
  {
    id: "github-copilot/gpt-4o",
    name: "GPT-4o (Copilot)",
    description: "OpenAI 多模態模型",
    provider: "github",
    status: "GA",
    requiresSubscription: "GitHub Copilot",
  },
  {
    id: "github-copilot/gpt-4o-mini",
    name: "GPT-4o Mini (Copilot)",
    description: "輕量版 GPT-4o",
    provider: "github",
    status: "GA",
    requiresSubscription: "GitHub Copilot",
  },
  
  // --- Claude 系列 ---
  {
    id: "github-copilot/claude-haiku-4.5",
    name: "Claude Haiku 4.5 (Copilot)",
    description: "快速且便宜",
    provider: "github",
    status: "GA",
    requiresSubscription: "GitHub Copilot",
  },
  {
    id: "github-copilot/claude-sonnet-4",
    name: "Claude Sonnet 4 (Copilot)",
    description: "平衡效能",
    provider: "github",
    status: "GA",
    requiresSubscription: "GitHub Copilot",
  },
  {
    id: "github-copilot/claude-sonnet-4.5",
    name: "Claude Sonnet 4.5 (Copilot)",
    description: "改進版 Sonnet",
    provider: "github",
    status: "GA",
    requiresSubscription: "GitHub Copilot",
  },
  {
    id: "github-copilot/claude-sonnet-4.6",
    name: "Claude Sonnet 4.6 (Copilot)",
    description: "最新 Sonnet",
    provider: "github",
    status: "GA",
    requiresSubscription: "GitHub Copilot",
  },
  {
    id: "github-copilot/claude-opus-4.5",
    name: "Claude Opus 4.5 (Copilot)",
    description: "強大的 Opus",
    provider: "github",
    status: "GA",
    requiresSubscription: "GitHub Copilot",
  },
  {
    id: "github-copilot/claude-opus-4.6",
    name: "Claude Opus 4.6 (Copilot)",
    description: "最強 Claude 模型",
    provider: "github",
    status: "GA",
    requiresSubscription: "GitHub Copilot",
  },
  {
    id: "github-copilot/claude-opus-4.6-fast",
    name: "Claude Opus 4.6 Fast (Copilot) 🚀",
    description: "快速模式 (Preview)",
    provider: "github",
    status: "Public preview",
    requiresSubscription: "GitHub Copilot",
  },
  
  // --- Gemini 系列 ---
  {
    id: "github-copilot/gemini-2.5-pro",
    name: "Gemini 2.5 Pro (Copilot)",
    description: "最新專業版 Gemini",
    provider: "github",
    status: "GA",
    requiresSubscription: "GitHub Copilot",
  },
  {
    id: "github-copilot/gemini-3-flash",
    name: "Gemini 3 Flash (Copilot) ⚡",
    description: "超快速 Gemini 3 (Preview)",
    provider: "github",
    status: "Public preview",
    requiresSubscription: "GitHub Copilot",
  },
  {
    id: "github-copilot/gemini-3.1-pro",
    name: "Gemini 3.1 Pro (Copilot) 🌟",
    description: "最新 Gemini 3.1 (Preview)",
    provider: "github",
    status: "Public preview",
    requiresSubscription: "GitHub Copilot",
  },
  {
    id: "github-copilot/gemini-2.0-flash-exp",
    name: "Gemini 2.0 Flash Exp (Copilot)",
    description: "實驗版 Gemini 2.0",
    provider: "github",
    status: "Preview",
    requiresSubscription: "GitHub Copilot",
  },
  {
    id: "github-copilot/gemini-1.5-pro",
    name: "Gemini 1.5 Pro (Copilot)",
    description: "穩定版專業 Gemini",
    provider: "github",
    status: "GA",
    requiresSubscription: "GitHub Copilot",
  },
  
  // --- o1 系列 (推理) ---
  {
    id: "github-copilot/o1",
    name: "OpenAI o1 (Copilot)",
    description: "完整版推理模型",
    provider: "github",
    status: "GA",
    requiresSubscription: "GitHub Copilot",
  },
  {
    id: "github-copilot/o1-preview",
    name: "OpenAI o1 Preview (Copilot)",
    description: "預覽版推理模型",
    provider: "github",
    status: "Preview",
    requiresSubscription: "GitHub Copilot",
  },
  {
    id: "github-copilot/o1-mini",
    name: "OpenAI o1 Mini (Copilot)",
    description: "輕量版推理模型",
    provider: "github",
    status: "GA",
    requiresSubscription: "GitHub Copilot",
  },
  
  // --- xAI Grok ---
  {
    id: "github-copilot/grok-code-fast-1",
    name: "Grok Code Fast 1 (Copilot)",
    description: "xAI 快速程式碼模型",
    provider: "github",
    status: "GA",
    requiresSubscription: "GitHub Copilot",
  },
  
  // --- Fine-tuned Models (微調模型) ---
  {
    id: "github-copilot/raptor-mini",
    name: "Raptor mini (Copilot) 🦖",
    description: "基於 GPT-5 mini 微調 (Preview)",
    provider: "github",
    status: "Public preview",
    requiresSubscription: "GitHub Copilot",
  },
  {
    id: "github-copilot/goldeneye",
    name: "Goldeneye (Copilot) 🎯",
    description: "基於 GPT-5.1-Codex 微調 (Preview)",
    provider: "github",
    status: "Public preview",
    requiresSubscription: "GitHub Copilot",
  },
];

export const DEFAULT_MODEL = "anthropic/claude-sonnet-4-6";

export function isValidModel(modelId: string): boolean {
  return AVAILABLE_MODELS.some(m => m.id === modelId);
}

export function getModelInfo(modelId: string): ModelInfo | undefined {
  return AVAILABL
