import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Bot, CheckCircle2, Clock3, MessageSquareText, Play, Search, Sparkles, Trash2 } from "lucide-react";
import "./styles.css";

type RequestType = "spec_qna" | "feature_change";
type AnswerStrategy = "rag" | "coding_agent_readonly" | "requirement_analysis";
type SessionStatus = "answered" | "needs_clarification" | "ready_for_poc" | "poc_deployed";
type MessageRole = "user" | "gateway" | "coding_agent" | "system";
type MessageVisibility = "user_visible" | "internal";

type SessionMessage = {
  id: string;
  role: MessageRole;
  content: string;
  visibility: MessageVisibility;
  created_at: string;
};

type AgentRun = {
  id: string;
  task: string;
  provider: string;
  model: string;
  trace_id: string | null;
  status: string;
  created_at: string;
};

type AgentSession = {
  id: string;
  user_name: string;
  request_text: string;
  request_type: RequestType;
  answer_strategy: AnswerStrategy;
  gateway_model: string;
  coding_model: string;
  status: SessionStatus;
  answer: string;
  impacted_areas: string[];
  open_questions: string[];
  sources: string[];
  next_actions: string[];
  messages: SessionMessage[];
  agent_runs: AgentRun[];
  conversation_summary: string | null;
  spec_summary: string | null;
  spec_summary_ready: boolean;
  poc_plan: string | null;
  poc_url: string | null;
  created_at: string;
  updated_at: string;
  is_pending?: boolean;
};

type RepoVersion = {
  name: string;
  path: string;
  commit_hash: string;
  short_hash: string;
  description: string;
};

type RepoVersions = {
  items: RepoVersion[];
};

type AgentRuntimeStatus = {
  provider: string;
  status: string;
  bridge_url: string | null;
  detail: string | null;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json; charset=utf-8", ...options?.headers },
    ...options,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "系統處理失敗" }));
    throw new Error(typeof error.detail === "string" ? error.detail : "系統處理失敗");
  }
  return response.json();
}

function now() {
  return new Date().toISOString();
}

function makePendingSession(payload: {
  userName: string;
  requestText: string;
  requestType: RequestType;
  answerStrategy: AnswerStrategy;
  gatewayModel: string;
  codingModel: string;
}): AgentSession {
  const id = `pending-${crypto.randomUUID().slice(0, 8)}`;
  const createdAt = now();
  return {
    id,
    user_name: payload.userName,
    request_text: payload.requestText,
    request_type: payload.requestType,
    answer_strategy: payload.answerStrategy,
    gateway_model: payload.gatewayModel,
    coding_model: payload.codingModel,
    status: "needs_clarification",
    answer: "Coding Agent 正在讀取系統脈絡並整理回答...",
    impacted_areas: [],
    open_questions: [],
    sources: [],
    next_actions: [],
    messages: [
      {
        id: `${id}-user`,
        role: "user",
        content: payload.requestText,
        visibility: "user_visible",
        created_at: createdAt,
      },
      {
        id: `${id}-gateway`,
        role: "gateway",
        content: "Gateway Agent 已收到內容，正在轉交 Coding Agent 分析。",
        visibility: "user_visible",
        created_at: createdAt,
      },
      {
        id: `${id}-coding`,
        role: "coding_agent",
        content: "分析中...",
        visibility: "user_visible",
        created_at: createdAt,
      },
    ],
    agent_runs: [],
    conversation_summary: null,
    spec_summary: null,
    spec_summary_ready: false,
    poc_plan: null,
    poc_url: null,
    created_at: createdAt,
    updated_at: createdAt,
    is_pending: true,
  };
}

function defaultRequestText(type: RequestType) {
  return type === "spec_qna" ? "續借規則" : "我想新增續借功能，讓使用者可以延長借書期限。";
}

function defaultFollowUpText(type: RequestType) {
  return type === "spec_qna" ? "歸還方式" : "我確認這個需求，可以進入 POC。";
}

function App() {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [repoVersions, setRepoVersions] = useState<RepoVersions | null>(null);
  const [agentRuntimeStatus, setAgentRuntimeStatus] = useState<AgentRuntimeStatus | null>(null);
  const [selectedRepoVersionName, setSelectedRepoVersionName] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<RequestType>("spec_qna");
  const [featureSubTab, setFeatureSubTab] = useState<"analysis" | "poc">("analysis");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [userName, setUserName] = useState("PM Demo");
  const [requestType, setRequestType] = useState<RequestType>("spec_qna");
  const [strategy, setStrategy] = useState<"rag" | "coding_agent_readonly">("rag");
  const [gatewayModel, setGatewayModel] = useState("5.4-Mini");
  const [codingModel, setCodingModel] = useState("5.4-Mini");
  const [requestText, setRequestText] = useState(defaultRequestText("spec_qna"));
  const [followUpText, setFollowUpText] = useState(defaultFollowUpText("spec_qna"));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function refreshSessions() {
    setSessions(await api<AgentSession[]>("/sessions"));
  }

  async function refreshRepoVersions() {
    const payload = await api<RepoVersions>("/repo-versions");
    setRepoVersions(payload);
    setSelectedRepoVersionName((current) => current ?? payload.items[0]?.name ?? null);
  }

  async function refreshAgentRuntimeStatus() {
    setAgentRuntimeStatus(await api<AgentRuntimeStatus>("/agent-runtime/status"));
  }

  async function deleteOneSession(sessionId: string) {
    if (!window.confirm(`確定要刪除 ${sessionId} 嗎？`)) return;

    setLoading(true);
    setError("");
    try {
      await api<{ deleted: string }>(`/sessions/${sessionId}`, { method: "DELETE" });
      setSessions((current) => current.filter((session) => session.id !== sessionId));
      setActiveSessionId((current) => (current === sessionId ? null : current));
    } catch (err) {
      setError(err instanceof Error ? err.message : "刪除 session 失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshSessions();
    void refreshRepoVersions();
    void refreshAgentRuntimeStatus();
  }, []);

  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? null;
  const selectedRepoVersion =
    repoVersions?.items.find((item) => item.name === selectedRepoVersionName) ?? repoVersions?.items[0] ?? null;

  const visibleSessions = useMemo(() => {
    return sessions.filter((session) => {
      if (session.request_type !== activeTab) return false;
      if (activeTab === "feature_change" && featureSubTab === "poc") {
        return session.status === "ready_for_poc" || session.status === "poc_deployed";
      }
      if (activeTab === "feature_change") {
        return session.status !== "ready_for_poc" && session.status !== "poc_deployed";
      }
      return true;
    });
  }, [activeTab, featureSubTab, sessions]);

  async function submitSession(event: React.FormEvent) {
    event.preventDefault();
    const answerStrategy = requestType === "feature_change" ? "requirement_analysis" : strategy;
    const pending = makePendingSession({
      userName,
      requestText,
      requestType,
      answerStrategy,
      gatewayModel,
      codingModel,
    });

    setLoading(true);
    setError("");
    setSessions((current) => [pending, ...current]);
    setActiveTab(requestType);
    setFeatureSubTab("analysis");
    setActiveSessionId(pending.id);
    setFollowUpText(defaultFollowUpText(requestType));
    setIsModalOpen(false);

    try {
      const session = await api<AgentSession>("/sessions", {
        method: "POST",
        body: JSON.stringify({
          user_name: userName,
          request_text: requestText,
          request_type: requestType,
          answer_strategy: answerStrategy,
          gateway_model: gatewayModel,
          coding_model: codingModel,
        }),
      });
      setSessions((current) => [session, ...current.filter((item) => item.id !== pending.id)]);
      setActiveSessionId(session.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "建立 session 失敗");
      setSessions((current) =>
        current.map((item) =>
          item.id === pending.id
            ? {
                ...item,
                is_pending: false,
                answer: "Coding Agent 執行失敗，請確認 bridge 是否啟動。",
                messages: [
                  ...item.messages,
                  {
                    id: `${item.id}-error`,
                    role: "system",
                    content: err instanceof Error ? err.message : "建立 session 失敗",
                    visibility: "user_visible",
                    created_at: now(),
                  },
                ],
              }
            : item,
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  async function runAction(action: () => Promise<AgentSession>) {
    setLoading(true);
    setError("");
    try {
      const session = await action();
      await refreshSessions();
      setActiveSessionId(session.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失敗");
    } finally {
      setLoading(false);
    }
  }

  async function submitFollowUp(event: React.FormEvent) {
    event.preventDefault();
    if (!activeSession || activeSession.is_pending) return;

    const pendingId = `pending-reply-${crypto.randomUUID().slice(0, 8)}`;
    const targetSessionId = activeSession.id;
    const text = followUpText;
    const pendingUserMessage: SessionMessage = {
      id: `${pendingId}-user`,
      role: "user",
      content: text,
      visibility: "user_visible",
      created_at: now(),
    };
    const pendingAgentMessage: SessionMessage = {
      id: `${pendingId}-agent`,
      role: "coding_agent",
      content: "Coding Agent 正在依照新的回覆更新分析...",
      visibility: "user_visible",
      created_at: now(),
    };

    setLoading(true);
    setError("");
    setFollowUpText(defaultFollowUpText(activeSession.request_type));
    setSessions((current) =>
      current.map((session) =>
        session.id === targetSessionId
          ? {
              ...session,
              is_pending: true,
              messages: [...session.messages, pendingUserMessage, pendingAgentMessage],
              updated_at: now(),
            }
          : session,
      ),
    );

    try {
      const session = await api<AgentSession>(`/sessions/${targetSessionId}/reply`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      setSessions((current) => current.map((item) => (item.id === targetSessionId ? session : item)));
      setActiveSessionId(session.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "送出提問失敗");
      setSessions((current) =>
        current.map((session) =>
          session.id === targetSessionId
            ? {
                ...session,
                is_pending: false,
                messages: [
                  ...session.messages,
                  {
                    id: `${pendingId}-error`,
                    role: "system",
                    content: err instanceof Error ? err.message : "送出提問失敗",
                    visibility: "user_visible",
                    created_at: now(),
                  },
                ],
                updated_at: now(),
              }
            : session,
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  async function summarizeCurrentConversation() {
    if (!activeSession || activeSession.is_pending) return;

    const targetSessionId = activeSession.id;
    const pendingId = `pending-summary-${crypto.randomUUID().slice(0, 8)}`;
    const pendingMessage: SessionMessage = {
      id: pendingId,
      role: "coding_agent",
      content: "正在整理此 session 的提問與回答...",
      visibility: "user_visible",
      created_at: now(),
    };

    setLoading(true);
    setError("");
    setSessions((current) =>
      current.map((session) =>
        session.id === targetSessionId
          ? {
              ...session,
              is_pending: true,
              messages: [...session.messages, pendingMessage],
              updated_at: now(),
            }
          : session,
      ),
    );

    try {
      const session = await api<AgentSession>(`/sessions/${targetSessionId}/conversation-summary`, { method: "POST" });
      setSessions((current) => current.map((item) => (item.id === targetSessionId ? session : item)));
      setActiveSessionId(session.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "session 總結失敗");
      setSessions((current) =>
        current.map((session) =>
          session.id === targetSessionId
            ? {
                ...session,
                is_pending: false,
                messages: [
                  ...session.messages,
                  {
                    id: `${pendingId}-error`,
                    role: "system",
                    content: err instanceof Error ? err.message : "session 總結失敗",
                    visibility: "user_visible",
                    created_at: now(),
                  },
                ],
                updated_at: now(),
              }
            : session,
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">PM / UX 工作入口</p>
          <h1>XX系統 agent工作台</h1>
          <p className="subcopy">
            使用者可以詢問系統規格、提出功能異動，Gateway Agent 會轉交 Coding Agent 讀取系統脈絡並整理回覆。
          </p>
        </div>
        <a className="toplink" href="http://localhost:8080" target="_blank" rel="noreferrer">
          開啟借書系統
        </a>
      </header>

      <section className="status-band">
        <div>
          <Bot size={20} />
          <span>Gateway Agent：5.4-Mini</span>
        </div>
        <div>
          <MessageSquareText size={20} />
          <span>Code Agent：5.4-Mini{agentRuntimeStatus ? ` / ${labelRuntimeStatus(agentRuntimeStatus.status)}` : ""}</span>
        </div>
        <div>
          <Search size={20} />
          <span>版本號：v1.0.0</span>
        </div>
      </section>

      {error && <div className="error-banner">{error}</div>}

      <section className="workspace-grid">
        <aside className="panel">
          <div className="session-actions">
            <button className="new-request-button" onClick={() => setIsModalOpen(true)}>
              新增 Session
            </button>
          </div>

          <div className="tabs">
            <button className={activeTab === "spec_qna" ? "active" : ""} onClick={() => setActiveTab("spec_qna")}>
              規格詢問
            </button>
            <button className={activeTab === "feature_change" ? "active" : ""} onClick={() => setActiveTab("feature_change")}>
              功能異動
            </button>
          </div>

          <div className="subtabs">
            {activeTab === "spec_qna" && <button className="active">工作階段</button>}
            {activeTab === "feature_change" && (
              <>
                <button className={featureSubTab === "analysis" ? "active" : ""} onClick={() => setFeatureSubTab("analysis")}>
                  分析
                </button>
                <button className={featureSubTab === "poc" ? "active" : ""} onClick={() => setFeatureSubTab("poc")}>
                  POC
                </button>
              </>
            )}
          </div>

          <div className="history">
            {visibleSessions.length === 0 && <p className="helper-text">目前沒有符合條件的 session。</p>}
            {visibleSessions.map((session) => (
              <div key={session.id} className={activeSessionId === session.id ? "history-item active" : "history-item"}>
                <button
                  className="history-select"
                  onClick={() => {
                    setActiveSessionId(session.id);
                    setFollowUpText(defaultFollowUpText(session.request_type));
                  }}
                >
                  <strong>{session.id}</strong>
                  <span>
                    {labelRequestType(session.request_type)} / {session.is_pending ? "分析中" : session.status}
                  </span>
                </button>
                <button
                  className="delete-session-button"
                  title="刪除 session"
                  disabled={loading || session.is_pending}
                  onClick={() => void deleteOneSession(session.id)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          {repoVersions && (
            <div className="repo-summary">
              <h3>版本</h3>
              <div className="version-list">
                {repoVersions.items.map((version) => (
                  <button
                    key={version.name}
                    className={selectedRepoVersion?.name === version.name ? "version-pill active" : "version-pill"}
                    onClick={() => setSelectedRepoVersionName(version.name)}
                  >
                    <strong>{version.name}</strong>
                    <span>{version.short_hash}</span>
                  </button>
                ))}
              </div>
              {selectedRepoVersion && (
                <div className="version-detail">
                  <p className="version-label">Commit hash</p>
                  <code>{selectedRepoVersion.commit_hash}</code>
                  <p className="version-label">Description</p>
                  <p>{selectedRepoVersion.description}</p>
                  <p className="version-label">Path</p>
                  <p>{selectedRepoVersion.path}</p>
                </div>
              )}
            </div>
          )}
        </aside>

        <section className="result-surface">
          {!activeSession && (
            <div className="empty-state">
              <Sparkles size={28} />
              <h2>請新增一個 Session</h2>
              <p>可以詢問既有規格，也可以提出功能異動需求。</p>
            </div>
          )}

          {activeSession && (
            <article className="result">
              <div className="result-header">
                <div>
                  <p className="eyebrow">sessionId</p>
                  <h2>{activeSession.id}</h2>
                </div>
                <div className="header-actions">
                  <span className={`pill ${activeSession.status} ${activeSession.is_pending ? "pending" : ""}`}>
                    {activeSession.is_pending ? "分析中" : activeSession.status}
                  </span>
                  {activeSession.status === "ready_for_poc" && !activeSession.is_pending && (
                    <button
                      className="compact-action"
                      onClick={() => runAction(() => api(`/sessions/${activeSession.id}/deploy-mock`, { method: "POST" }))}
                    >
                      <Play size={16} />
                      Mock 部署 POC
                    </button>
                  )}
                </div>
              </div>

              {activeSession.poc_url && (
                <div className="preview-url-banner">
                  <Play size={18} />
                  <div>
                    <strong>POC URL</strong>
                    <a href={activeSession.poc_url} target="_blank" rel="noreferrer">
                      {activeSession.poc_url}
                    </a>
                  </div>
                </div>
              )}

              <div className="meta-grid">
                <div>
                  <span>類型</span>
                  <strong>{labelRequestType(activeSession.request_type)}</strong>
                </div>
                <div>
                  <span>分析方式</span>
                  <strong>{labelStrategy(activeSession.answer_strategy)}</strong>
                </div>
                <div>
                  <span>使用者</span>
                  <strong>{activeSession.user_name}</strong>
                </div>
                <div>
                  <span>Gateway</span>
                  <strong>{activeSession.gateway_model}</strong>
                </div>
                <div>
                  <span>Code Agent</span>
                  <strong>{activeSession.coding_model}</strong>
                </div>
              </div>

              <section>
                <h3>對話紀錄</h3>
                <div className="conversation">
                  {activeSession.messages.map((item) => (
                    <MessageCard key={item.id} item={item} session={activeSession} />
                  ))}
                </div>
              </section>

              {activeSession.is_pending && (
                <div className="pending-banner">
                  <Clock3 size={18} />
                  <span>Coding Agent 正在分析 repo 與系統規格，完成後會自動更新此 session。</span>
                </div>
              )}

              {!activeSession.is_pending && (
                <form
                  className="follow-up-form"
                  onSubmit={submitFollowUp}
                >
                  <label>
                    繼續提問或回覆釐清問題
                    <textarea value={followUpText} onChange={(event) => setFollowUpText(event.target.value)} />
                  </label>
                  <button type="submit" disabled={loading}>
                    <MessageSquareText size={18} />
                    {activeSession.request_type === "spec_qna" ? "送出提問" : "送出到此 Session"}
                  </button>
                </form>
              )}

              {activeSession.next_actions.length > 0 && <ListBlock title="下一步" items={activeSession.next_actions} />}

              {activeSession.agent_runs.length > 0 && (
                <section>
                  <h3>Agent 執行紀錄</h3>
                  <div className="run-list">
                    {activeSession.agent_runs.map((run) => (
                      <div className="run-item" key={run.id}>
                        <div>
                          <strong>{labelAgentTask(run.task)}</strong>
                          <span>
                            {run.provider} / {run.model} / {run.status}
                          </span>
                        </div>
                        <code>{run.trace_id ?? "local-runtime"}</code>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {activeSession.request_type === "spec_qna" && !activeSession.is_pending && (
                <div className="poc-actions">
                  <button
                    className="secondary-action"
                    onClick={summarizeCurrentConversation}
                  >
                    <Sparkles size={18} />
                    session 總結
                  </button>
                </div>
              )}

              {activeSession.conversation_summary && (
                <section className="spec-summary">
                  <h3>Session 對話總結</h3>
                  <p>{activeSession.conversation_summary}</p>
                </section>
              )}

              {activeSession.spec_summary && (
                <section className="spec-summary">
                  <h3>Session 規格總結</h3>
                  <p>{activeSession.spec_summary}</p>
                </section>
              )}

              {activeSession.poc_plan && (
                <section className="poc-plan">
                  <h3>POC 計畫</h3>
                  <p>{activeSession.poc_plan}</p>
                </section>
              )}

              {activeSession.request_type === "feature_change" && !activeSession.is_pending && (
                <div className="poc-actions">
                  {!activeSession.spec_summary_ready && <p className="gate-note">進入 POC 前，需要先總結 session 規格。</p>}
                  <button
                    className="secondary-action"
                    onClick={() => runAction(() => api(`/sessions/${activeSession.id}/spec-summary`, { method: "POST" }))}
                  >
                    <Sparkles size={18} />
                    總結 session 規格
                  </button>
                  <button
                    className="secondary-action"
                    disabled={!activeSession.spec_summary_ready}
                    onClick={() => runAction(() => api(`/sessions/${activeSession.id}/poc-plan`, { method: "POST" }))}
                  >
                    <Sparkles size={18} />
                    產生 POC 計畫
                  </button>
                  <button
                    className="secondary-action"
                    disabled={!activeSession.spec_summary_ready}
                    onClick={() => runAction(() => api(`/sessions/${activeSession.id}/ready-for-poc`, { method: "POST" }))}
                  >
                    <CheckCircle2 size={18} />
                    標記為可進入 POC 階段
                  </button>
                </div>
              )}
            </article>
          )}
        </section>
      </section>

      {isModalOpen && (
        <div className="modal-backdrop">
          <form className="request-modal" onSubmit={submitSession}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">新增 Session</p>
                <h2>提出問題或需求</h2>
              </div>
              <button type="button" className="close-button" onClick={() => setIsModalOpen(false)}>
                關閉
              </button>
            </div>

            <label>
              使用者名稱
              <input value={userName} onChange={(event) => setUserName(event.target.value)} />
            </label>

            <label>
              類型
              <select
                value={requestType}
                onChange={(event) => {
                  const next = event.target.value as RequestType;
                  setRequestType(next);
                  setRequestText(defaultRequestText(next));
                  setFollowUpText(defaultFollowUpText(next));
                }}
              >
                <option value="spec_qna">規格詢問</option>
                <option value="feature_change">功能異動</option>
              </select>
            </label>

            {requestType === "spec_qna" && (
              <label>
                規格詢問方式
                <select value={strategy} onChange={(event) => setStrategy(event.target.value as "rag" | "coding_agent_readonly")}>
                  <option value="rag">RAG</option>
                  <option value="coding_agent_readonly">原始碼分析</option>
                </select>
              </label>
            )}

            <label>
              Gateway Agent 模型
              <select value={gatewayModel} onChange={(event) => setGatewayModel(event.target.value)}>
                <option value="5.4-Mini">5.4-Mini</option>
              </select>
            </label>

            <label>
              Code Agent 模型
              <select value={codingModel} onChange={(event) => setCodingModel(event.target.value)}>
                <option value="5.4-Mini">5.4-Mini</option>
              </select>
            </label>

            <label>
              {requestType === "spec_qna" ? "問題內容" : "需求內容"}
              <textarea value={requestText} onChange={(event) => setRequestText(event.target.value)} />
            </label>

            <button type="submit" disabled={loading}>
              建立 Session
            </button>
          </form>
        </div>
      )}
    </main>
  );
}

function MessageCard({ item, session }: { item: SessionMessage; session: AgentSession }) {
  const showAnalysis = item === session.messages.find((message) => message.role === "gateway" && message.visibility === "user_visible");
  return (
    <div className={`message-bubble ${item.role} ${session.is_pending && item.role === "coding_agent" ? "thinking" : ""}`}>
      <strong>{roleLabel(item.role)}</strong>
      <span className={`visibility ${item.visibility}`}>{item.visibility === "internal" ? "內部" : "使用者可見"}</span>
      <p>{item.content}</p>
      {showAnalysis && (
        <div className="embedded-analysis">
          <ListBlock title="影響範圍" items={session.impacted_areas} />
          <ListBlock title="待釐清問題" items={session.open_questions} />
        </div>
      )}
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function roleLabel(role: MessageRole) {
  return {
    user: "使用者",
    gateway: "Gateway Agent",
    coding_agent: "Code Agent",
    system: "系統",
  }[role];
}

function labelRequestType(type: RequestType) {
  return type === "spec_qna" ? "規格詢問" : "功能異動";
}

function labelStrategy(strategy: AnswerStrategy) {
  return {
    rag: "RAG",
    coding_agent_readonly: "原始碼分析",
    requirement_analysis: "需求分析",
  }[strategy];
}

function labelRuntimeStatus(status: string) {
  if (status === "ok") return "已連線";
  if (status === "unreachable") return "未連線";
  return status;
}

function labelAgentTask(task: string) {
  const labels: Record<string, string> = {
    analyze_new_session: "首次分析",
    analyze_followup: "追問分析",
    summarize_conversation: "對話總結",
    summarize_spec: "規格總結",
    ready_for_poc: "POC 準備",
    deploy_poc: "POC 部署",
    plan_poc: "POC 計畫",
  };
  return labels[task] ?? task;
}

createRoot(document.getElementById("root")!).render(<App />);
