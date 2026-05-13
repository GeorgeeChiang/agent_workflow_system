# 真實 Coding Agent 啟動說明

這份說明是給 `agent_workflow_system` 的本機落地版，目標是讓 `workbench_api` 透過本機 Codex CLI 做需求分析。

## 啟動順序

| 步驟 | 指令 | 說明 |
|---|---|---|
| 1 | `powershell -ExecutionPolicy Bypass -File .\agent_bridge\start.ps1` | 啟動本機 bridge，負責把請求轉給 Codex CLI |
| 2 | `docker compose up --build` | 啟動借書系統前後端、workbench API、workbench UI |
| 3 | 打開 `http://localhost:8090` | 進入工作台操作 session |

## 重要設定

| 項目 | 說明 |
|---|---|
| `Gateway Agent` | 目前仍是工作台內部的 gateway 流程 |
| `Code Agent` | 透過 bridge 呼叫本機 Codex CLI |
| `模型顯示` | UI 顯示 `5.4-Mini`，bridge 實際送入 `gpt-5.4-mini` |
| `Codex Home` | bridge 會在 `.agent_codex_home` 建立獨立 home，避免和 Codex app 互相影響 |

## 驗證方式

1. 建立一個新的 session。
2. 提交像 `有期限嗎?` 這種問題。
3. 如果 bridge 與 Codex 正常，會看到由 Codex 產生的回答與參考來源。

