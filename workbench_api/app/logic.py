from __future__ import annotations

import zlib
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from .agent_runtime import get_agent_runtime
from .models import AgentSession, RepoVersion, RepoVersions, RequestType, SessionMessage


ROOT = Path("/workspace")
FRONTEND_ROOT = ROOT / "systems" / "frontend"
BACKEND_ROOT = ROOT / "systems" / "backend"
RUNTIME = get_agent_runtime()


def _repair_mojibake(text: str) -> str:
    if not text:
        return text

    likely_mojibake_markers = ("Ã", "Â", "ç", "é", "æ", "è", "å", "ä", "ê", "î", "ô")
    if not any(marker in text for marker in likely_mojibake_markers):
        return text

    try:
        repaired = text.encode("latin1").decode("utf-8")
    except UnicodeError:
        return text

    if repaired == text:
        return text

    better_markers = ("借", "歸", "續", "規", "書", "系統", "期限", "還", "借閱", "登入")
    if any(marker in repaired for marker in better_markers):
        return repaired
    return text


def now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def make_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:8]}"


def make_message(role: str, content: str, visibility: str = "user_visible") -> SessionMessage:
    return SessionMessage(
        id=make_id("msg"),
        role=role,  # type: ignore[arg-type]
        content=content,
        visibility=visibility,  # type: ignore[arg-type]
        created_at=now(),
    )


def _gitdir_for(worktree: Path) -> Path | None:
    git_entry = worktree / ".git"
    if git_entry.is_dir():
        return git_entry
    if git_entry.is_file():
        text = git_entry.read_text(encoding="utf-8", errors="replace").strip()
        if text.startswith("gitdir:"):
            value = text.split(":", 1)[1].strip()
            candidate = (worktree / value).resolve()
            if candidate.exists():
                return candidate
    return None


def _resolve_ref(gitdir: Path, ref: str) -> str | None:
    ref_path = gitdir / ref
    if ref_path.exists():
        return ref_path.read_text(encoding="utf-8", errors="replace").strip()

    packed_refs = gitdir / "packed-refs"
    if packed_refs.exists():
        for line in packed_refs.read_text(encoding="utf-8", errors="replace").splitlines():
            if not line or line.startswith("#") or line.startswith("^"):
                continue
            commit_hash, ref_name = line.split(" ", 1)
            if ref_name.strip() == ref:
                return commit_hash.strip()
    return None


def _head_commit_hash(gitdir: Path) -> str | None:
    head_path = gitdir / "HEAD"
    if not head_path.exists():
        return None

    head = head_path.read_text(encoding="utf-8", errors="replace").strip()
    if head.startswith("ref:"):
        ref = head.split(":", 1)[1].strip()
        return _resolve_ref(gitdir, ref)
    return head or None


def _commit_message(gitdir: Path, commit_hash: str) -> str:
    object_path = gitdir / "objects" / commit_hash[:2] / commit_hash[2:]
    if object_path.exists():
        try:
            raw = zlib.decompress(object_path.read_bytes()).decode("utf-8", errors="replace")
            body = raw.split("\x00", 1)[1]
            message = body.split("\n\n", 1)[1] if "\n\n" in body else body
            first_line = message.strip().splitlines()[0].strip()
            return first_line or commit_hash[:7]
        except Exception:
            pass

    log_path = gitdir / "logs" / "HEAD"
    if log_path.exists():
        lines = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
        for line in reversed(lines):
            if "\t" in line:
                return line.split("\t", 1)[1].strip() or commit_hash[:7]

    return commit_hash[:7]


def _repo_version(name: str, worktree: Path) -> RepoVersion:
    gitdir = _gitdir_for(worktree)
    if gitdir is None:
        return RepoVersion(
            name=name,
            path=str(worktree.relative_to(ROOT)),
            commit_hash="unknown",
            short_hash="unknown",
            description="找不到 Git 資訊",
        )

    commit_hash = _head_commit_hash(gitdir) or "unknown"
    short_hash = commit_hash[:7] if commit_hash != "unknown" else "unknown"
    description = _commit_message(gitdir, commit_hash) if commit_hash != "unknown" else "找不到 commit 訊息"
    return RepoVersion(
        name=name,
        path=str(worktree.relative_to(ROOT)),
        commit_hash=commit_hash,
        short_hash=short_hash,
        description=description,
    )


def repo_versions() -> RepoVersions:
    return RepoVersions(
        items=[
            _repo_version("frontend", FRONTEND_ROOT),
            _repo_version("backend", BACKEND_ROOT),
        ]
    )


def default_followup_text(request_type: RequestType) -> str:
    if request_type == "spec_qna":
        return "借書的期限。"
    return "我確認這個需求，可以進入 POC。"


def gateway_prompt(
    request_type: RequestType,
    text: str,
    session_id: str,
    gateway_model: str,
    coding_model: str,
) -> str:
    task = (
        "根據現有借書系統的規格與程式碼，先回答使用者的問題，必要時提出釐清問題。"
        if request_type == "spec_qna"
        else "根據現有借書系統的規格與程式碼，評估需求影響範圍、釐清問題，並整理是否可進入 POC。"
    )
    return (
        "Gateway -> Coding Agent\n"
        f"sessionId: {session_id}\n"
        f"Gateway model: {gateway_model}\n"
        f"Coding model: {coding_model}\n"
        f"任務: {task}\n"
        f"使用者輸入: {text}"
    )


def coding_agent_content(answer: str, impacted: list[str], questions: list[str], sources: list[str]) -> str:
    blocks = [answer]
    if impacted:
        blocks.append("影響範圍:\n" + "\n".join(f"- {item}" for item in impacted))
    if questions:
        blocks.append("待釐清問題:\n" + "\n".join(f"- {item}" for item in questions))
    if sources:
        blocks.append("參考來源:\n" + "\n".join(f"- {item}" for item in sources))
    return "\n\n".join(blocks)


def infer_sources(request_type: RequestType) -> list[str]:
    if request_type == "spec_qna":
        return [
            "systems/backend/app/main.py",
            "systems/backend/app/seed.py",
            "systems/frontend/src/main.tsx",
        ]
    return [
        "systems/frontend/src/main.tsx",
        "systems/backend/app/main.py",
        "systems/backend/app/models.py",
    ]


def create_session(
    user_name: str,
    request_text: str,
    request_type: RequestType,
    answer_strategy: str,
    gateway_model: str,
    coding_model: str,
) -> AgentSession:
    session_id = make_id("req")
    created_at = now()
    request_text = _repair_mojibake(request_text)
    if request_type == "feature_change":
        answer_strategy = "requirement_analysis"

    analysis = RUNTIME.analyze_new_session(
        user_name=user_name,
        request_text=request_text,
        request_type=request_type,
        answer_strategy=answer_strategy,
        session_id=session_id,
        gateway_model=gateway_model,
        coding_model=coding_model,
    )
    agent_content = coding_agent_content(
        analysis.answer,
        analysis.impacted_areas,
        analysis.open_questions,
        analysis.sources,
    )

    return AgentSession(
        id=session_id,
        user_name=user_name,
        request_text=request_text,
        request_type=request_type,
        answer_strategy=answer_strategy,  # type: ignore[arg-type]
        gateway_model=gateway_model,
        coding_model=coding_model,
        status=analysis.status,  # type: ignore[arg-type]
        answer=analysis.answer,
        impacted_areas=analysis.impacted_areas,
        open_questions=analysis.open_questions,
        sources=analysis.sources,
        next_actions=analysis.next_actions,
        messages=[
            make_message("user", request_text),
            make_message(
                "gateway",
                gateway_prompt(request_type, request_text, session_id, gateway_model, coding_model),
                "internal",
            ),
            make_message("coding_agent", agent_content, "internal"),
            make_message("gateway", agent_content),
        ],
        conversation_summary=None,
        spec_summary=None,
        spec_summary_ready=False,
        poc_url=None,
        created_at=created_at,
        updated_at=created_at,
    )


def reply_to_session(session: AgentSession, text: str) -> AgentSession:
    text = _repair_mojibake(text)
    analysis = RUNTIME.analyze_followup(session=session, text=text)

    session.answer = analysis.answer
    session.status = analysis.status  # type: ignore[assignment]
    session.impacted_areas = analysis.impacted_areas
    session.open_questions = analysis.open_questions
    session.sources = analysis.sources
    session.next_actions = analysis.next_actions
    session.spec_summary = None
    session.spec_summary_ready = False
    session.updated_at = now()
    agent_content = coding_agent_content(
        analysis.answer,
        analysis.impacted_areas,
        analysis.open_questions,
        analysis.sources,
    )
    session.messages.extend(
        [
            make_message("user", text),
            make_message(
                "gateway",
                gateway_prompt(session.request_type, text, session.id, session.gateway_model, session.coding_model),
                "internal",
            ),
            make_message("coding_agent", agent_content, "internal"),
            make_message("gateway", agent_content),
        ]
    )
    return session


def summarize_conversation(session: AgentSession) -> AgentSession:
    session.conversation_summary = RUNTIME.summarize_conversation(session=session)
    session.updated_at = now()
    session.messages.append(make_message("system", "已產生 session 總結。"))
    return session


def summarize_spec(session: AgentSession) -> AgentSession:
    session.spec_summary = RUNTIME.summarize_spec(session=session)
    session.spec_summary_ready = True
    session.updated_at = now()
    session.messages.extend(
        [
            make_message("gateway", f"Gateway 已彙整 session {session.id} 的規格。", "internal"),
            make_message("coding_agent", session.spec_summary, "internal"),
            make_message("gateway", session.spec_summary),
        ]
    )
    return session


def mark_ready_for_poc(session: AgentSession) -> AgentSession:
    session.status = "ready_for_poc"
    session.next_actions = RUNTIME.ready_for_poc(session=session)
    session.updated_at = now()
    session.messages.append(make_message("system", "此 session 已標記為可進入 POC 階段。"))
    return session


def deploy_mock(session: AgentSession) -> AgentSession:
    session.status = "poc_deployed"
    session.poc_url, session.next_actions = RUNTIME.deploy_poc(session=session)
    session.updated_at = now()
    session.messages.extend(
        [
            make_message("system", "Mock POC 已部署完成。"),
            make_message("gateway", f"Mock POC URL: {session.poc_url}"),
        ]
    )
    return session
