from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .logic import (
    create_session,
    deploy_mock,
    mark_ready_for_poc,
    repo_versions,
    reply_to_session,
    summarize_conversation,
    summarize_spec,
)
from .models import AgentSession, RepoVersions, SessionCreate, SessionReply
from .storage import clear_sessions, delete_session, get_session, init_db, load_sessions, save_session


app = FastAPI(title="Agent Workflow Workbench API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/repo-versions", response_model=RepoVersions)
def get_repo_versions() -> RepoVersions:
    return repo_versions()


@app.get("/sessions", response_model=list[AgentSession])
def sessions() -> list[AgentSession]:
    return load_sessions()


@app.delete("/sessions")
def delete_sessions() -> dict[str, int]:
    return {"deleted": clear_sessions()}


@app.get("/sessions/{session_id}", response_model=AgentSession)
def session_detail(session_id: str) -> AgentSession:
    session = get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="找不到 session")
    return session


@app.delete("/sessions/{session_id}")
def delete_one_session(session_id: str) -> dict[str, str]:
    if not delete_session(session_id):
        raise HTTPException(status_code=404, detail="找不到 session")
    return {"deleted": session_id}


@app.post("/sessions", response_model=AgentSession)
def create(payload: SessionCreate) -> AgentSession:
    session = create_session(
        payload.user_name,
        payload.request_text,
        payload.request_type,
        payload.answer_strategy,
        payload.gateway_model,
        payload.coding_model,
    )
    return save_session(session)


@app.post("/sessions/{session_id}/reply", response_model=AgentSession)
def reply(session_id: str, payload: SessionReply) -> AgentSession:
    session = get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="找不到 session")
    return save_session(reply_to_session(session, payload.text))


@app.post("/sessions/{session_id}/conversation-summary", response_model=AgentSession)
def conversation_summary(session_id: str) -> AgentSession:
    session = get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="找不到 session")
    return save_session(summarize_conversation(session))


@app.post("/sessions/{session_id}/spec-summary", response_model=AgentSession)
def spec_summary(session_id: str) -> AgentSession:
    session = get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="找不到 session")
    return save_session(summarize_spec(session))


@app.post("/sessions/{session_id}/ready-for-poc", response_model=AgentSession)
def ready_for_poc(session_id: str) -> AgentSession:
    session = get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="找不到 session")
    if not session.spec_summary_ready:
        raise HTTPException(status_code=409, detail="請先總結 session 規格")
    return save_session(mark_ready_for_poc(session))


@app.post("/sessions/{session_id}/deploy-mock", response_model=AgentSession)
def deploy(session_id: str) -> AgentSession:
    session = get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="找不到 session")
    if session.status != "ready_for_poc":
        raise HTTPException(status_code=409, detail="此 session 還不能部署 POC")
    return save_session(deploy_mock(session))
