# Agent Workflow 規劃

## 目標

讓 PM / UX 可以透過工作台詢問系統規格或提出功能異動需求，由 Gateway Agent 管理 session，再交由 RAG 或 Coding Agent 讀取 submodule 中的前後端 repo。

## 工作流

| 類型 | 流程 | 產出 |
|---|---|---|
| 規格詢問 | PM / UX 提問 -> Gateway Agent -> RAG 或 source 分析 -> 回答 | 規格答案、參考來源 |
| 功能異動 | PM / UX 提需求 -> Coding Agent 分析 repo -> 回覆影響範圍與待釐清問題 | 分析結果、session 規格 |
| POC 製作 | session 規格 -> 建 branch/worktree -> Coding Agent 修改 -> Docker build -> 部署 | POC URL |

## Coding Agent 可替換

| Coding Agent | 用途 |
|---|---|
| GitHub Copilot / Copilot SDK | 使用公司既有 VS Code Copilot 工作流 |
| OpenAI Codex | Agentic coding、修改 repo、跑測試 |
| Claude Code | 替代 Coding Agent |
| Local LLM + RAG | 規格查詢與內部文件問答 |

## POC 部署選項

| 平台 | 用途 |
|---|---|
| Local Docker Compose | 本機 demo 與開發 |
| AWS App Runner | 快速部署 container 並取得 URL |
| AWS ECS Fargate | 多服務正式 POC 環境 |
| EC2 + Docker Compose | 低成本內部展示 |

