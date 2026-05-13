# Agent Workflow System

此 repo 是 Agent 工作流的整合工作區，透過 git submodule 掛入借書系統前端與後端 repo。

## Repo 結構

| 路徑 | 說明 |
|---|---|
| `systems/frontend` | 借書系統前端 submodule |
| `systems/backend` | 借書系統後端 submodule |
| `docker-compose.yml` | 本機 demo 啟動設定 |
| `docs/agent-workflow.md` | Agent 工作流規劃 |

## 啟動

```powershell
git submodule update --init --recursive
docker compose up --build
```

啟動後：

| 服務 | URL |
|---|---|
| 借書系統前端 | http://localhost:8080 |
| Backend API | http://localhost:8000 |
| API 文件 | http://localhost:8000/docs |

## Demo 帳號

| 帳號 | 密碼 | 使用者 |
|---|---|---|
| user1 | 123456 | 小明 |
| user2 | 123456 | 小華 |
| user3 | 123456 | 小美 |

