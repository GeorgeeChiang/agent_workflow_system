# Agent Bridge

這個服務跑在本機，負責把 `workbench_api` 送來的任務轉交給本機的 Codex CLI。

## 目的

- `workbench_api` 保持在 Docker 裡
- `Codex CLI` 在本機執行，能直接讀取專案 workspace
- 產品流程先走真實分析，保留 mock 作為 fallback

## 啟動

```powershell
powershell -ExecutionPolicy Bypass -File .\agent_bridge\start.ps1
```

## 主要環境變數

| 變數 | 說明 |
|---|---|
| `CODEX_BIN` | Codex CLI 執行檔位置，預設使用 OpenAI 安裝路徑 |
| `CODEX_MODEL` | 實際送進 Codex CLI 的模型名稱，預設 `gpt-5.4-mini` |
| `AGENT_BRIDGE_PORT` | Bridge 監聽埠，預設 `8020` |
| `AGENT_BRIDGE_HOST` | Bridge 綁定位址，預設 `127.0.0.1` |
| `WORKSPACE_ROOT` | 專案根目錄，Codex 會在這裡讀 repo |

## API

- `GET /health`
- `POST /run`
