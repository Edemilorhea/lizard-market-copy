# 遷移到 OpenCode SDK

本文檔說明從 Claude Agent SDK 遷移到 OpenCode SDK 的變更與測試步驟。

## 📊 變更摘要

### **依賴變更**
- ❌ 移除: `@anthropic-ai/claude-agent-sdk`
- ✅ 新增: `@opencode-ai/sdk@^1.3.13`

### **架構變更**

#### **SessionManager (`src/session-manager.ts`)**
- **舊**: 每次 `query()` 返回獨立串流
- **新**: 共用 OpenCode server + 全域事件監聽器
- **Port**: 14096 (專案模式)
- **關鍵改變**:
  - 使用 `createOpencode()` 初始化共用 server
  - 透過 `client.event.subscribe()` 接收所有 session 的事件
  - 根據 `session_id` 過濾並路由訊息到正確的 Discord 頻道
  - 訊息緩衝機制 (2秒或1500字元)

#### **Server (`server.ts` - Ops 模式)**
- **舊**: 使用 Claude SDK 的 `query()` + `resume`
- **新**: 獨立 OpenCode client with separate server
- **Port**: 14097 (Ops 模式)
- **關鍵改變**:
  - 用 `session.create()` 建立 Ops session
  - 用 `session.prompt()` 發送訊息
  - 不再使用 `ResponsePoster`,直接分段發送回應

#### **Bot (`src/bot.ts`)**
- 在 `start()` 方法中呼叫 `sessionManager.initialize()`
- 確保 OpenCode SDK 在 Discord bot 啟動前就緒

---

## 🚀 測試步驟

### **1. 安裝依賴**
```bash
bun install
```

### **2. 檢查編譯**
```bash
bun x tsc --noEmit --skipLibCheck
```
應該沒有錯誤輸出。

### **3. 配置環境**
確保 `~/.discord-orchestrator/.env` 包含:
```
DISCORD_BOT_TOKEN=your-bot-token-here
```

### **4. 配置專案**
確保 `~/.discord-orchestrator/projects.json` 格式正確:
```json
{
  "projects": {
    "test-project": {
      "name": "test-project",
      "path": "/absolute/path/to/project",
      "channels": ["discord-channel-id"]
    }
  },
  "ops_channel": "ops-channel-id",
  "idle_timeout_ms": 3600000
}
```

### **5. 啟動 Bot**
```bash
bun server.ts
```

預期輸出:
```
[session-manager] Initializing OpenCode SDK...
[session-manager] OpenCode server started at http://127.0.0.1:14096
[session-manager] Starting global event listener...
[orchestrator] Initializing OpenCode SDK for Ops mode...
[orchestrator] Ops OpenCode server started at http://127.0.0.1:14097
[orchestrator] API server on http://127.0.0.1:XXXXX
[orchestrator] Starting...
[orchestrator] Bot ready as YourBot#1234
[orchestrator] 1 projects registered
[orchestrator] Ops channel: 1234567890
```

### **6. 測試專案模式**
1. 在綁定的專案頻道發送訊息: `Hello, can you help me?`
2. 預期行為:
   - Bot 發送 "Working on it..." 確認訊息
   - 開始 typing indicator
   - 回應訊息逐步出現 (串流效果)
   - 完成後刪除確認訊息

### **7. 測試 Ops 模式**
1. 在 ops 頻道發送訊息: `List all registered projects`
2. 預期行為:
   - Bot 發送 typing indicator
   - 顯示專案列表
   - 可以讀寫 `projects.json`
   - 可以呼叫 Discord API (curl 本地端點)

### **8. 測試會話持久化**
1. 發送訊息: `My name is Alice`
2. 等待回應
3. 發送訊息: `What is my name?`
4. 預期回應應該記得 "Alice"

### **9. 測試閒置超時**
1. 發送訊息後等待超過 1 小時 (或調整 `idle_timeout_ms`)
2. Session 應該自動關閉但保留 session ID
3. 下次訊息會恢復 session

---

## ⚠️ 已知限制

### **1. 插件支援未驗證**
原始實作載入了 3 個插件:
- Linear
- Kratos
- Frontend Design

**狀態**: OpenCode SDK 文檔未明確說明如何載入本地插件。
**建議**: 需要測試或改用 MCP servers。

### **2. 權限審批未實作**
原始實作使用 Discord reaction 來審批工具執行。

**狀態**: 已移除 (postApprovalAndWait 未被呼叫)。
**建議**: 需要重新實作或使用 OpenCode 的權限系統。

### **3. 事件過濾複雜度**
全域事件流需要手動過濾 `session_id`,多專案同時運作時可能有效能影響。

**監控**: 檢查事件監聽器的 CPU 使用率。

### **4. 錯誤處理**
OpenCode SDK 的錯誤格式可能與 Claude SDK 不同,需要測試各種錯誤情境。

---

## 🐛 故障排除

### **Port 已被佔用**
```
Error: listen EADDRINUSE: address already in use 127.0.0.1:14096
```
**解決方案**:
- 檢查其他 OpenCode 實例: `lsof -i :14096` (Linux/Mac) 或 `netstat -ano | findstr 14096` (Windows)
- 終止衝突進程或修改 `port` 配置

### **OpenCode SDK 初始化失敗**
```
[session-manager] Failed to initialize OpenCode SDK: ...
```
**解決方案**:
- 確認已安裝 `@opencode-ai/sdk`
- 檢查網路連線
- 查看完整錯誤訊息

### **Session 無法恢復**
如果 `session.get()` 失敗,會自動建立新 session。
**注意**: 這會導致對話歷史遺失。

### **訊息未出現**
檢查事件監聽器日誌:
- 是否收到事件?
- `session_id` 是否匹配?
- Discord 頻道是否可訪問?

---

## 📝 回滾步驟

如果遷移遇到嚴重問題,可以快速回滾:

```bash
# 切換回 master 分支
git checkout master

# 重新安裝舊依賴
bun install

# 啟動
bun server.ts
```

---

## ✅ 驗收標準

遷移成功的標準:
- [x] Bot 成功啟動,無錯誤
- [x] 專案頻道訊息有回應
- [x] Ops 頻道可以管理配置
- [x] 會話持久化正常運作
- [x] 多專案同時運作不混亂
- [ ] 插件功能正常 (需驗證)
- [ ] 權限審批正常 (需實作)

---

## 🔗 相關資源

- [OpenCode SDK 文檔](https://opencode.ai/docs/sdk/)
- [OpenCode Discord](https://opencode.ai/discord)
- [原始 Claude SDK](https://github.com/anthropics/anthropic-sdk-typescript)

---

## 📧 支援

如有問題,請:
1. 查看此文檔的故障排除部分
2. 檢查 GitHub Issues
3. 在 OpenCode Discord 詢問
