from __future__ import annotations

import json
import os
import tempfile
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Protocol

from .models import AgentSession, RequestType


@dataclass
class AgentAnalysis:
    answer: str
    impacted_areas: list[str]
    open_questions: list[str]
    sources: list[str]
    next_actions: list[str]
    status: str


class AgentRuntime(Protocol):
    name: str

    def analyze_new_session(
        self,
        *,
        user_name: str,
        request_text: str,
        request_type: RequestType,
        answer_strategy: str,
        session_id: str,
        gateway_model: str,
        coding_model: str,
    ) -> AgentAnalysis: ...

    def analyze_followup(self, *, session: AgentSession, text: str) -> AgentAnalysis: ...
    def summarize_conversation(self, *, session: AgentSession) -> str: ...
    def summarize_spec(self, *, session: AgentSession) -> str: ...
    def plan_poc(self, *, session: AgentSession) -> str: ...
    def ready_for_poc(self, *, session: AgentSession) -> list[str]: ...
    def deploy_poc(self, *, session: AgentSession) -> tuple[str, list[str]]: ...


def _looks_like_library_question(text: str) -> bool:
    lowered = text.lower()
    keywords = [
        "借書",
        "借閱",
        "書",
        "期限",
        "天數",
        "歸還",
        "預約",
        "borrow",
        "loan",
        "book",
        "return",
        "renew",
    ]
    return any(keyword in text for keyword in keywords) or any(keyword in lowered for keyword in keywords)


class MockAgentRuntime:
    name = "mock"

    def analyze_new_session(
        self,
        *,
        user_name: str,
        request_text: str,
        request_type: RequestType,
        answer_strategy: str,
        session_id: str,
        gateway_model: str,
        coding_model: str,
    ) -> AgentAnalysis:
        if request_type == "spec_qna":
            if _looks_like_library_question(request_text):
                return AgentAnalysis(
                    answer="目前看起來您是在詢問借書系統的規格，但資訊還不夠完整。請問您要確認的是借書期限、續借規則，還是歸還方式？",
                    impacted_areas=[],
                    open_questions=[
                        "您要確認的是哪一段借書流程？",
                        "這個問題是否與借書、預約、歸還或續借有關？",
                    ],
                    sources=[
                        "systems/backend/app/main.py",
                        "systems/backend/app/seed.py",
                        "systems/frontend/src/main.tsx",
                    ],
                    next_actions=[],
                    status="needs_clarification",
                )
            return AgentAnalysis(
                answer="這個問題看起來不是借書系統相關的規格問題，請改成與系統功能有關的提問。",
                impacted_areas=[],
                open_questions=[
                    "請改問借書系統的功能、流程或資料規則。",
                ],
                sources=[
                    "systems/backend/app/main.py",
                    "systems/backend/app/seed.py",
                    "systems/frontend/src/main.tsx",
                ],
                next_actions=[],
                status="needs_clarification",
            )

        return AgentAnalysis(
            answer="這個需求看起來會影響前端借書流程、後端借閱 API 與資料庫借閱資料。",
            impacted_areas=[
                "前端借書介面",
                "後端借閱 API",
                "資料庫借閱資料",
            ],
            open_questions=[
                "新的借書規則是否要套用在所有使用者？",
                "POC 階段是否要先保留原本流程，只加上提示與檢查？",
            ],
            sources=[
                "systems/frontend/src/main.tsx",
                "systems/backend/app/main.py",
                "systems/backend/app/models.py",
            ],
            next_actions=[
                "先整理需求與影響範圍",
                "若確認可做，再進入 POC 規格總結",
            ],
            status="needs_clarification",
        )

    def analyze_followup(self, *, session: AgentSession, text: str) -> AgentAnalysis:
        if session.request_type == "spec_qna":
            if _looks_like_library_question(text):
                if "借" in text and ("期限" in text or "天" in text or "天數" in text):
                    return AgentAnalysis(
                        answer="借書期限目前是 14 天。",
                        impacted_areas=[
                            "借閱規則",
                            "會員借書流程",
                        ],
                        open_questions=[],
                        sources=session.sources,
                        next_actions=[],
                        status="answered",
                    )
                return AgentAnalysis(
                    answer="我還需要再確認你問的是借書、預約、歸還，還是續借哪一段規格。",
                    impacted_areas=[],
                    open_questions=["請具體指出你要查詢的借書規格。"],
                    sources=session.sources,
                    next_actions=[],
                    status="needs_clarification",
                )

            return AgentAnalysis(
                answer="這個問題不是借書系統的規格內容，請改成與系統有關的提問。",
                impacted_areas=[],
                open_questions=["請重新提出借書系統相關問題。"],
                sources=session.sources,
                next_actions=[],
                status="needs_clarification",
            )

        lowered = text.lower()
        ready_words = ["進入 poc", "可進入 poc", "可以進入 poc", "ok", "同意", "deploy", "進入poc"]
        if any(word in lowered for word in ready_words):
            return AgentAnalysis(
                answer="收到，這個需求可以進入 POC 階段。",
                impacted_areas=session.impacted_areas,
                open_questions=[],
                sources=session.sources,
                next_actions=[
                    "建立 POC session",
                    "切出獨立分支或 worktree",
                    "在 POC 環境驗證結果",
                ],
                status="ready_for_poc",
            )

        return AgentAnalysis(
            answer="我會先把這個變更視為需求討論，並持續補足影響範圍與待釐清問題。",
            impacted_areas=session.impacted_areas or [
                "前端介面",
                "後端 API",
            ],
            open_questions=[
                "是否要直接修改現有借書規則？",
                "是否需要先做成 POC 給使用者確認？",
            ],
            sources=session.sources,
            next_actions=["等待更多需求資訊或確認是否進入 POC"],
            status=session.status,
        )

    def summarize_conversation(self, *, session: AgentSession) -> str:
        visible = [
            msg
            for msg in session.messages
            if msg.visibility == "user_visible" and msg.role in {"user", "gateway"}
        ]
        lines = ["Session 對話整理："]
        for index, item in enumerate(visible, start=1):
            speaker = "使用者" if item.role == "user" else "Agent"
            lines.append(f"{index}. {speaker}: {item.content}")
        return "\n".join(lines)

    def summarize_spec(self, *, session: AgentSession) -> str:
        user_texts = [msg.content for msg in session.messages if msg.role == "user"]
        lines = [
            "Session 規格總結：",
            f"1. 使用者：{session.user_name}",
            f"2. 初始需求：{session.request_text}",
            f"3. 目前答案：{session.answer}",
            "4. 後續提問：" + (" / ".join(user_texts[1:]) if len(user_texts) > 1 else "無"),
            "5. 影響範圍：" + (" / ".join(session.impacted_areas) if session.impacted_areas else "尚未確認"),
        ]
        return "\n".join(lines)

    def plan_poc(self, *, session: AgentSession) -> str:
        lines = [
            "POC 計畫：",
            "1. 目標：依照已總結的 session 規格製作可驗證版本。",
            "2. 修改範圍：" + (" / ".join(session.impacted_areas) if session.impacted_areas else "前端與後端需再確認"),
            "3. 驗收方式：PM / UX 可透過 POC URL 操作流程並確認結果。",
            "4. 風險：目前仍是 mock 部署，尚未接實際 branch、build、deploy 流程。",
        ]
        return "\n".join(lines)

    def ready_for_poc(self, *, session: AgentSession) -> list[str]:
        return [
            "建立獨立的 POC session",
            "準備可驗證的需求摘要",
            "讓使用者確認後再進行修改",
        ]

    def deploy_poc(self, *, session: AgentSession) -> tuple[str, list[str]]:
        return (
            "https://www.google.com/",
            [
                "將 POC 結果提供給 PM / UX 檢視",
                "待真正部署流程完成後，再替換為實際環境 URL",
            ],
        )


class BridgeAgentRuntime:
    name = "bridge"

    def __init__(
        self,
        *,
        bridge_url: str,
        workspace_root: str,
        fallback: AgentRuntime | None = None,
    ) -> None:
        self.bridge_url = bridge_url.rstrip("/")
        self.workspace_root = workspace_root
        self.fallback = fallback or MockAgentRuntime()

    def _post_json(self, path: str, payload: dict) -> dict:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(
            f"{self.bridge_url}{path}",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=300) as response:
            raw = response.read().decode("utf-8")
        return json.loads(raw)

    def _run(self, task: str, payload: dict) -> dict | None:
        self.last_trace_id = None
        request = {
            "task": task,
            "workspace_root": self.workspace_root,
            "payload": payload,
        }
        try:
            response = self._post_json("/run", request)
            if not response.get("ok"):
                raise RuntimeError(response.get("error") or "bridge returned an error")
            result = response.get("result")
            if not isinstance(result, dict):
                raise RuntimeError("bridge returned an invalid result")
            trace_id = response.get("trace_id")
            self.last_trace_id = str(trace_id) if trace_id else None
            return result
        except (urllib.error.URLError, TimeoutError, ValueError, RuntimeError) as exc:
            raise RuntimeError(f"coding agent bridge failed: {exc}") from exc

    def analyze_new_session(
        self,
        *,
        user_name: str,
        request_text: str,
        request_type: RequestType,
        answer_strategy: str,
        session_id: str,
        gateway_model: str,
        coding_model: str,
    ) -> AgentAnalysis:
        result = self._run(
            "analyze_new_session",
            {
                "user_name": user_name,
                "request_text": request_text,
                "request_type": request_type,
                "answer_strategy": answer_strategy,
                "session_id": session_id,
                "gateway_model": gateway_model,
                "coding_model": coding_model,
            },
        )
        if result is None:
            return self.fallback.analyze_new_session(
                user_name=user_name,
                request_text=request_text,
                request_type=request_type,
                answer_strategy=answer_strategy,
                session_id=session_id,
                gateway_model=gateway_model,
                coding_model=coding_model,
            )
        return AgentAnalysis(
            answer=str(result.get("answer", "")),
            impacted_areas=[str(item) for item in result.get("impacted_areas", [])],
            open_questions=[str(item) for item in result.get("open_questions", [])],
            sources=[str(item) for item in result.get("sources", [])],
            next_actions=[str(item) for item in result.get("next_actions", [])],
            status=str(result.get("status", "needs_clarification")),
        )

    def analyze_followup(self, *, session: AgentSession, text: str) -> AgentAnalysis:
        result = self._run(
            "analyze_followup",
            {
                "session": session.model_dump(mode="json"),
                "text": text,
            },
        )
        if result is None:
            return self.fallback.analyze_followup(session=session, text=text)
        return AgentAnalysis(
            answer=str(result.get("answer", "")),
            impacted_areas=[str(item) for item in result.get("impacted_areas", [])],
            open_questions=[str(item) for item in result.get("open_questions", [])],
            sources=[str(item) for item in result.get("sources", [])],
            next_actions=[str(item) for item in result.get("next_actions", [])],
            status=str(result.get("status", session.status)),
        )

    def summarize_conversation(self, *, session: AgentSession) -> str:
        result = self._run("summarize_conversation", {"session": session.model_dump(mode="json")})
        if result is None:
            return self.fallback.summarize_conversation(session=session)
        return str(result.get("summary", ""))

    def summarize_spec(self, *, session: AgentSession) -> str:
        result = self._run("summarize_spec", {"session": session.model_dump(mode="json")})
        if result is None:
            return self.fallback.summarize_spec(session=session)
        return str(result.get("summary", ""))

    def plan_poc(self, *, session: AgentSession) -> str:
        result = self._run("plan_poc", {"session": session.model_dump(mode="json")})
        if result is None:
            return self.fallback.plan_poc(session=session)
        return str(result.get("plan", ""))

    def ready_for_poc(self, *, session: AgentSession) -> list[str]:
        result = self._run("ready_for_poc", {"session": session.model_dump(mode="json")})
        if result is None:
            return self.fallback.ready_for_poc(session=session)
        return [str(item) for item in result.get("next_actions", [])]

    def deploy_poc(self, *, session: AgentSession) -> tuple[str, list[str]]:
        result = self._run("deploy_poc", {"session": session.model_dump(mode="json")})
        if result is None:
            return self.fallback.deploy_poc(session=session)
        url = str(result.get("url", "https://www.google.com/"))
        next_actions = [str(item) for item in result.get("next_actions", [])]
        return url, next_actions


def get_agent_runtime() -> AgentRuntime:
    provider = os.getenv("AGENT_RUNTIME_PROVIDER", "bridge").strip().lower()
    if provider in {"mock", "default"}:
        return MockAgentRuntime()
    if provider in {"bridge", "codex", "codex-cli"}:
        return BridgeAgentRuntime(
            bridge_url=os.getenv("AGENT_BRIDGE_URL", "http://host.docker.internal:8020"),
            workspace_root=os.getenv("AGENT_WORKSPACE_ROOT", "/workspace"),
        )
    return MockAgentRuntime()


def agent_runtime_status() -> dict[str, str | None]:
    provider = os.getenv("AGENT_RUNTIME_PROVIDER", "bridge").strip().lower()
    if provider in {"mock", "default"}:
        return {
            "provider": "mock",
            "status": "ok",
            "bridge_url": None,
            "detail": "mock runtime enabled",
        }

    bridge_url = os.getenv("AGENT_BRIDGE_URL", "http://host.docker.internal:8020").rstrip("/")
    try:
        with urllib.request.urlopen(f"{bridge_url}/health", timeout=3) as response:
            payload = json.loads(response.read().decode("utf-8"))
        return {
            "provider": provider,
            "status": str(payload.get("status", "ok")),
            "bridge_url": bridge_url,
            "detail": "bridge reachable",
        }
    except Exception as exc:
        return {
            "provider": provider,
            "status": "unreachable",
            "bridge_url": bridge_url,
            "detail": str(exc),
        }
