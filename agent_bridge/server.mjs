import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const PORT = Number(process.env.AGENT_BRIDGE_PORT || 8020);
const HOST = process.env.AGENT_BRIDGE_HOST || "0.0.0.0";
const CODEX_BIN = process.env.CODEX_BIN || "C:\\Users\\dodo\\AppData\\Local\\OpenAI\\Codex\\bin\\codex.exe";
const DEFAULT_MODEL = process.env.CODEX_MODEL || "gpt-5.4-mini";
const SOURCE_CODEX_HOME = process.env.AGENT_BRIDGE_SOURCE_CODEX_HOME || "C:\\Users\\dodo\\.codex";
const BRIDGE_CODEX_HOME = process.env.AGENT_BRIDGE_CODEX_HOME || path.resolve(process.cwd(), ".agent_codex_home");
const LOG_PATH = process.env.AGENT_BRIDGE_LOG || path.resolve(process.cwd(), "agent_bridge", "bridge.log");
const TRACE_DIR = process.env.AGENT_BRIDGE_TRACE_DIR || path.resolve(process.cwd(), "agent_bridge", "traces");
const HOST_WORKSPACE_ROOT =
  process.env.WORKSPACE_ROOT || "C:\\Users\\dodo\\Documents\\Codex\\develop_team_work\\agent_workflow_system";

function ensureDirForFile(filePath) {
  return mkdir(path.dirname(filePath), { recursive: true });
}

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

function log(message) {
  const line = `${new Date().toISOString()} ${message}\n`;
  try {
    appendFileSync(LOG_PATH, line, "utf8");
  } catch {
    // ignore logging failures
  }
}

async function saveTrace(traceId, payload) {
  await ensureDir(TRACE_DIR);
  const tracePath = path.join(TRACE_DIR, `${traceId}.json`);
  await writeFile(tracePath, JSON.stringify(payload, null, 2), "utf8");
  return tracePath;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}

async function ensureBridgeCodexHome() {
  await ensureDir(BRIDGE_CODEX_HOME);
  try {
    await copyFile(path.join(SOURCE_CODEX_HOME, "auth.json"), path.join(BRIDGE_CODEX_HOME, "auth.json"));
  } catch {
    // ignore missing auth copy problems
  }
  try {
    await copyFile(path.join(SOURCE_CODEX_HOME, "config.toml"), path.join(BRIDGE_CODEX_HOME, "config.toml"));
  } catch {
    // config is optional
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 5_000_000) {
        reject(new Error("request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function normalizeModel(model) {
  const value = String(model || "").trim();
  if (!value || value === "5.4-Mini" || value.toLowerCase() === "gpt-5.4-mini") {
    return DEFAULT_MODEL;
  }
  return value;
}

function buildSchema(task) {
  if (task === "analyze_new_session" || task === "analyze_followup") {
    return {
      type: "object",
      additionalProperties: false,
      required: ["answer", "impacted_areas", "open_questions", "sources", "next_actions", "status"],
      properties: {
        answer: { type: "string" },
        impacted_areas: { type: "array", items: { type: "string" } },
        open_questions: { type: "array", items: { type: "string" } },
        sources: { type: "array", items: { type: "string" } },
        next_actions: { type: "array", items: { type: "string" } },
        status: {
          type: "string",
          enum: ["answered", "needs_clarification", "ready_for_poc", "poc_deployed"],
        },
      },
    };
  }

  if (task === "summarize_conversation" || task === "summarize_spec") {
    return {
      type: "object",
      additionalProperties: false,
      required: ["summary"],
      properties: { summary: { type: "string" } },
    };
  }

  if (task === "ready_for_poc") {
    return {
      type: "object",
      additionalProperties: false,
      required: ["next_actions"],
      properties: { next_actions: { type: "array", items: { type: "string" } } },
    };
  }

  if (task === "deploy_poc") {
    return {
      type: "object",
      additionalProperties: false,
      required: ["url", "next_actions"],
      properties: {
        url: { type: "string" },
        next_actions: { type: "array", items: { type: "string" } },
      },
    };
  }

  throw new Error(`unsupported task: ${task}`);
}

function buildPrompt(task, payload, workspaceRoot) {
  const baseInstructions = [
    "You are the Coding Agent for a library system.",
    `workspace root: ${workspaceRoot}`,
    "The workspace contains systems/frontend and systems/backend.",
    "Rules:",
    "- Do not output source code or large code excerpts.",
    "- Keep sources to file paths only.",
    "- Write for PM/UX readers.",
    "- If a question is not about the library system, say so plainly and do not force it into a borrow-term answer.",
  ];

  if (task === "analyze_new_session") {
    return [
      ...baseInstructions,
      "Analyze the new request and decide whether it is a specification question or a feature change.",
      `user_name: ${payload.user_name}`,
      `request_type: ${payload.request_type}`,
      `answer_strategy: ${payload.answer_strategy}`,
      `session_id: ${payload.session_id}`,
      `gateway_model: ${payload.gateway_model}`,
      `coding_model: ${payload.coding_model}`,
      `request_text: ${payload.request_text}`,
      "If the request is not related to the library system, answer that it is out of scope and ask the user to rephrase.",
      "If the request is related to the library system, then decide whether it needs clarification or can be answered.",
      "Return only valid JSON that matches the schema.",
    ].join("\n");
  }

  if (task === "analyze_followup") {
    return [
      ...baseInstructions,
      "Update the analysis based on the follow-up message.",
      `session: ${JSON.stringify(payload.session)}`,
      `followup_text: ${payload.text}`,
      "If the follow-up is not related to the library system, answer that it is out of scope.",
      "If the follow-up is related to the library system, answer the question or mark it as ready_for_poc when appropriate.",
      "Return only valid JSON that matches the schema.",
    ].join("\n");
  }

  if (task === "summarize_conversation") {
    return [
      ...baseInstructions,
      "Summarize the visible conversation in a short, readable paragraph.",
      `session: ${JSON.stringify(payload.session)}`,
      "Return only valid JSON that matches the schema.",
    ].join("\n");
  }

  if (task === "summarize_spec") {
    return [
      ...baseInstructions,
      "Summarize the request, decision, impacted areas, open questions, and POC readiness.",
      `session: ${JSON.stringify(payload.session)}`,
      "Return only valid JSON that matches the schema.",
    ].join("\n");
  }

  if (task === "ready_for_poc") {
    return [
      ...baseInstructions,
      "List the next actions required before entering POC.",
      `session: ${JSON.stringify(payload.session)}`,
      "Return only valid JSON that matches the schema.",
    ].join("\n");
  }

  if (task === "deploy_poc") {
    return [
      ...baseInstructions,
      "Provide the POC deployment result and a user-facing URL.",
      `session: ${JSON.stringify(payload.session)}`,
      "If there is no real deployment yet, return https://www.google.com/ as the placeholder URL.",
      "Return only valid JSON that matches the schema.",
    ].join("\n");
  }

  throw new Error(`unsupported task: ${task}`);
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", chunk => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", chunk => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`codex exited with code ${code}${stderr ? `: ${stderr}` : ""}`));
    });
  });
}

async function runCodexTask(task, payload, workspaceRoot) {
  await ensureBridgeCodexHome();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "agent-bridge-"));
  const schemaPath = path.join(tempDir, "schema.json");
  const outputPath = path.join(tempDir, "last-message.json");
  const schema = buildSchema(task);
  const prompt = buildPrompt(task, payload, workspaceRoot);
  const model = normalizeModel(payload.coding_model || payload.gateway_model);
  const traceId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const args = [
    "exec",
    "--model",
    model,
    "--cd",
    workspaceRoot,
    "--sandbox",
    "workspace-write",
    "--ephemeral",
    "--output-schema",
    schemaPath,
    "--output-last-message",
    outputPath,
    "--skip-git-repo-check",
    prompt,
  ];

  try {
    await writeFile(schemaPath, JSON.stringify(schema, null, 2), "utf8");
    const startEntry = {
      trace_id: traceId,
      timestamp: new Date().toISOString(),
      task,
      workspace_root: workspaceRoot,
      model,
      prompt,
      args,
      payload,
    };
    await saveTrace(traceId, { ...startEntry, phase: "start" });
    log(`trace=${traceId} task=${task} model=${model}`);
    const procResult = await runProcess(CODEX_BIN, args, {
      env: {
        ...process.env,
        CODEX_HOME: BRIDGE_CODEX_HOME,
        USERPROFILE: "C:\\Users\\dodo",
        HOME: "C:\\Users\\dodo",
      },
    });
    const raw = await readFile(outputPath, "utf8");
    const parsed = JSON.parse(raw);
    const doneEntry = {
      ...startEntry,
      phase: "done",
      stdout: procResult.stdout,
      stderr: procResult.stderr,
      output_raw: raw,
      output_parsed: parsed,
    };
    await saveTrace(traceId, doneEntry);
    return { trace_id: traceId, result: parsed };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function normalizeWorkspaceRoot(workspaceRoot) {
  const value = String(workspaceRoot || "").trim();
  if (!value || value === "/workspace") {
    return HOST_WORKSPACE_ROOT;
  }
  return value;
}

async function readTrace(traceId) {
  const tracePath = path.join(TRACE_DIR, `${traceId}.json`);
  const raw = await readFile(tracePath, "utf8");
  return JSON.parse(raw);
}

process.on("uncaughtException", error => {
  log(`uncaughtException: ${error instanceof Error ? error.stack || error.message : String(error)}`);
});

process.on("unhandledRejection", error => {
  log(`unhandledRejection: ${error instanceof Error ? error.stack || error.message : String(error)}`);
});

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || `${HOST}:${PORT}`}`);

    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, { status: "ok" });
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/trace/")) {
      const traceId = url.pathname.split("/").filter(Boolean)[1] || "";
      if (!traceId) {
        sendJson(res, 400, { ok: false, error: "missing trace id" });
        return;
      }
      try {
        const trace = await readTrace(traceId);
        sendJson(res, 200, { ok: true, trace });
      } catch {
        sendJson(res, 404, { ok: false, error: "trace not found" });
      }
      return;
    }

    if (req.method !== "POST" || url.pathname !== "/run") {
      sendJson(res, 404, { ok: false, error: "not found" });
      return;
    }

    const body = await readJsonBody(req);
    const task = body.task;
    const workspaceRoot = normalizeWorkspaceRoot(body.workspace_root);
    const payload = body.payload || {};
    const result = await runCodexTask(task, payload, workspaceRoot);
    sendJson(res, 200, { ok: true, ...result });
  } catch (error) {
    log(`request failed: ${error instanceof Error ? error.stack || error.message : String(error)}`);
    sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "unknown error",
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Agent bridge listening on http://${HOST}:${PORT}`);
});
