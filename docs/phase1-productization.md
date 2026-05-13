# 第一階段任務表

> 目標：把目前的 demo 變成接近真實可用的產品骨架，讓 PM / UX 可以建立 session、選定 Gateway / Code Agent 模型、追蹤版本、並把確認過的需求推進到 POC。

## 概要
以 Win11 + 9800X3D + 64GB RAM + RTX 5080 規劃，採用 FastAPI、React/Vite、Docker Compose、SQLite，先做 session 管理、模型選擇、repo 版本顯示與 POC 流程，之後再接 Codex / Claude CLI 或 SDK。

## 成品流程
| 步驟 | 流程 | 輸出 |
|---|---|---|
| 1 | PM / UX 在工作台新增 session | 問題 / 需求 |
| 2 | Gateway Agent 分類與整理 | 規格詢問 / 功能異動 |
| 3 | Coding Agent 回答或分析 | 影響範圍、待釐清問題、參考來源 |
| 4 | 使用者總結 session | session 規格總結 |
| 5 | 標記可進 POC | ready_for_poc |
| 6 | Mock / 真實部署 | POC URL |

## 第一階段範圍
| 項目 | 工作內容 | 技術 |
|---|---|---|
| Session 產品化 | 新增 session 欄位，保存 Gateway / Code Agent 模型 | FastAPI、SQLite |
| 模型固定 | 先固定 Gateway / Code Agent 都為 `5.4-Mini` | 前端表單、API payload |
| 版本顯示 | 顯示 frontend / backend 最新版本號與 commit 細節 | Git submodule、Git metadata |
| Agent 分層 | Gateway 與 Coding Agent 分離，保留 provider 介面 | Python protocol / adapter |
| POC 流程 | session 總結、ready_for_poc、deploy mock | FastAPI、React |

## 分階段執行
| 階段 | 目標 | 驗收條件 |
|---|---|---|
| Phase 1 | 固定模型、保存 session、顯示版本號 | UI 可建立 session 並看到 5.4-Mini 與版本號 |
| Phase 2 | 接入真實 Coding Agent provider | 可用 CLI / SDK 呼叫 Codex 或 Claude |
| Phase 3 | 進入 POC branch / worktree / build / deploy | 可回傳可試用 URL |
| Phase 4 | 加入安全與治理 | 輸出過濾、隔離、操作紀錄 |

## 目前先做的任務
| 優先 | 任務 | 完成標準 |
|---|---|---|
| 1 | 整理 session 結構 | `gateway_model`、`coding_model` 持久化 |
| 2 | 清楚顯示頂部資訊 | 只顯示 Gateway Agent、Code Agent、版本號 |
| 3 | 釐清 provider 介面 | Gateway 可切換到 Codex / Claude |
| 4 | 保留 mock 行為 | demo 不中斷、UI 可穩定展示 |
| 5 | 文件化 | README 與 docs 同步更新 |

## 建議技術
| 類型 | 建議 | 備註 |
|---|---|---|
| Web 前端 | React + Vite | 開源 |
| API | FastAPI | 開源 |
| 儲存 | SQLite | 先做 demo 最快 |
| 容器 | Docker Compose | 開源 |
| Agent | Codex / Claude Code | 可先用 CLI，之後再接 SDK |
| 版本來源 | Git submodule | 直接讀 repo commit |

