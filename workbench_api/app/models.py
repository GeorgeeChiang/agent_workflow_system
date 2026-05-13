from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


RequestType = Literal["spec_qna", "feature_change"]
AnswerStrategy = Literal["rag", "coding_agent_readonly", "requirement_analysis"]
SessionStatus = Literal["answered", "needs_clarification", "ready_for_poc", "poc_deployed"]
MessageRole = Literal["user", "gateway", "coding_agent", "system"]
MessageVisibility = Literal["user_visible", "internal"]


class SessionMessage(BaseModel):
    id: str
    role: MessageRole
    content: str
    visibility: MessageVisibility
    created_at: str


class AgentSession(BaseModel):
    id: str
    user_name: str
    request_text: str
    request_type: RequestType
    answer_strategy: AnswerStrategy
    gateway_model: str = "5.4-Mini"
    coding_model: str = "5.4-Mini"
    status: SessionStatus
    answer: str
    impacted_areas: list[str]
    open_questions: list[str]
    sources: list[str]
    next_actions: list[str]
    messages: list[SessionMessage]
    conversation_summary: str | None
    spec_summary: str | None
    spec_summary_ready: bool
    poc_url: str | None
    created_at: str
    updated_at: str


class SessionCreate(BaseModel):
    user_name: str
    request_text: str
    request_type: RequestType
    answer_strategy: Literal["rag", "coding_agent_readonly"] = "rag"
    gateway_model: str = "5.4-Mini"
    coding_model: str = "5.4-Mini"


class SessionReply(BaseModel):
    text: str


class RepoSummary(BaseModel):
    frontend_file_count: int
    backend_file_count: int
    frontend_examples: list[str]
    backend_examples: list[str]


class RepoVersion(BaseModel):
    name: str
    path: str
    commit_hash: str
    short_hash: str
    description: str


class RepoVersions(BaseModel):
    items: list[RepoVersion]
