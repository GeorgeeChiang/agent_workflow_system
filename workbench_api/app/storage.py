from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from .models import AgentSession


DATA_DIR = Path(os.getenv("WORKBENCH_DATA_DIR", "/data"))
DB_PATH = DATA_DIR / "workbench.db"


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
              id TEXT PRIMARY KEY,
              payload TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """
        )
        conn.commit()


@contextmanager
def db():
    conn = sqlite3.connect(DB_PATH)
    try:
        yield conn
    finally:
        conn.close()


def save_session(session: AgentSession) -> AgentSession:
    payload = json.dumps(session.model_dump(mode="json"), ensure_ascii=False)
    with db() as conn:
        conn.execute(
            """
            INSERT INTO sessions (id, payload, created_at, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              payload = excluded.payload,
              updated_at = excluded.updated_at
            """,
            (session.id, payload, session.created_at, session.updated_at),
        )
        conn.commit()
    return session


def load_sessions() -> list[AgentSession]:
    with db() as conn:
        rows = conn.execute("SELECT payload FROM sessions ORDER BY updated_at DESC").fetchall()
    return [AgentSession.model_validate(json.loads(row[0])) for row in rows]


def clear_sessions() -> int:
    with db() as conn:
        cursor = conn.execute("DELETE FROM sessions")
        conn.commit()
        return cursor.rowcount


def delete_session(session_id: str) -> bool:
    with db() as conn:
        cursor = conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
        conn.commit()
        return cursor.rowcount > 0


def get_session(session_id: str) -> AgentSession | None:
    with db() as conn:
        row = conn.execute("SELECT payload FROM sessions WHERE id = ?", (session_id,)).fetchone()
    if row is None:
        return None
    return AgentSession.model_validate(json.loads(row[0]))
