# Agent Workflow System

這個 repo 是「PM / UX 可用的 Agent 工作台」主專案。它透過 Git submodule 收納借書系統前端與後端，讓 Gateway Agent 可以讀取整個系統脈絡，並在需要時呼叫 Coding Agent 進行分析、總結或 POC 製作。

## 專案結構

| 路徑 | 說明 |
|---|---|
| `systems/frontend` | 借書系統前端 submodule |
| `systems/backend` | 借書系統後端 submodule |
| `workbench_ui` | Agent 工作台前端 |
| `workbench_api` | Agent 工作台 API / Gateway Agent |
| `agent_bridge` | 連接主機 Codex CLI 的 bridge |
| `docker-compose.yml` | 一鍵啟動借書系統與 Agent 工作台 |
| `docs/` | 架構、產品化與真實 Coding Agent 串接說明 |

## 前置需求

| 工具 | 用途 |
|---|---|
| Git | 拉取主 repo 與 submodule |
| Docker Desktop | 啟動 PostgreSQL、前端、後端與工作台 |
| Node.js | 若要在本機直接啟動 `agent_bridge` |
| Codex CLI | 若要讓工作台真的呼叫 Coding Agent |

## 第一次啟動

```powershell
git submodule update --init --recursive
docker compose up --build
```

啟動後可開啟：

| 服務 | URL |
|---|---|
| 借書系統前端 | http://localhost:8080 |
| 借書系統 API | http://localhost:8000 |
| 借書系統 API 文件 | http://localhost:8000/docs |
| Agent 工作台 | http://localhost:8090 |
| Agent 工作台 API | http://localhost:8010 |

## 啟動真實 Coding Agent Bridge

若只啟動 Docker，工作台 API 會嘗試連到主機上的 bridge。要讓 Gateway Agent 真的呼叫 Codex CLI，請另外開一個 PowerShell：

```powershell
powershell -ExecutionPolicy Bypass -File .\agent_bridge\start.ps1
```

預設 bridge 位於：

```text
http://127.0.0.1:8020
```

常用環境變數：

| 變數 | 說明 | 預設 |
|---|---|---|
| `CODEX_BIN` | Codex CLI 執行檔 | `codex` |
| `CODEX_MODEL` | Coding Agent 模型 | `gpt-5.4-mini` |
| `AGENT_BRIDGE_PORT` | Bridge port | `8020` |
| `WORKSPACE_ROOT` | 給 Codex CLI 讀取的 workspace | 專案根目錄 |

## Demo 帳號

| 帳號 | 密碼 | 使用者 |
|---|---|---|
| `user1` | `123456` | 小明 |
| `user2` | `123456` | 小華 |
| `user3` | `123456` | 小美 |

## 常用操作

```powershell
# 啟動全部 Docker 服務
docker compose up --build

# 背景啟動
docker compose up --build -d

# 關閉服務
docker compose down

# 關閉服務並清除資料庫 volume
docker compose down -v
```

## 工作台目前支援

| 功能 | 說明 |
|---|---|
| 規格詢問 session | PM / UX 詢問現有系統規格 |
| 功能異動 session | 提出新增或調整功能需求 |
| Gateway Agent | 分類、整理、過濾使用者輸入與 Coding Agent 回應 |
| Coding Agent | 透過 bridge 呼叫 Codex CLI 分析 source code |
| Session 總結 | 進入 POC 前整理目前對話規格 |
| POC 計畫 | 在不啟動部署的情況下，先產出 PM / UX 可確認的 POC 實作計畫 |
| Mock POC 部署 | 將 ready session 標記為已部署並顯示 URL |
| Agent 執行紀錄 | 保存 provider、model、task、trace id，方便確認是否真的送到 Coding Agent |
| Runtime 狀態 | 顯示 Coding Agent bridge 是否已連線 |
