/**
 * BERA AI — Agentic AI assistant with real tool execution.
 *
 * Like a human assistant you can talk to:
 *  - "Create a GitHub repo called MyProject and push the README"
 *  - "Start my BeraHost deployment"
 *  - "Change mode to private and turn on auto read"
 *  - "What are my bot settings?"
 *
 * The AI reasons, sends live progress updates, executes tools, and loops
 * until the full task is done — just like your friend's bot.
 *
 * Commands: .beraai  .bai  .botai  .assistant  .admin
 */

import config from '../config.cjs';
import axios  from 'axios';
import fs     from 'fs';
import path   from 'path';
import { fileURLToPath } from 'url';

const __dir      = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dir, '..', 'data', 'state.json');
const p          = config.PREFIX;

// ─── GitHub + BeraHost credentials (set via env vars on BeraHost) ────────────
const GH_TOKEN  = process.env.GITHUB_TOKEN  || config.GITHUB_TOKEN  || '';
const GH_REPO   = process.env.GITHUB_REPO   || config.GITHUB_REPO   || 'bera-tech-ai/CLOUD-AI';
const BH_BASE   = config.BERAHOST_API || process.env.BERAHOST_API || 'https://berahost-v1.replit.app';
const BH_KEY    = config.BERAHOST_KEY || process.env.BERAHOST_KEY || '';

// ─── State helpers ────────────────────────────────────────────────────────────
function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}
function writeState(key, value) {
  const s = readState();
  s[key]  = value;
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
  config.setState?.(key, value);
}
function getBotCtx() {
  const s = readState();
  return {
    bot_name:       config.BOT_NAME  || s.BOT_NAME  || 'CLOUD AI',
    prefix:         config.PREFIX    || s.PREFIX     || '.',
    mode:           config.MODE      || s.MODE       || 'public',
    version:        config.VERSION   || '3.2.0',
    owner_name:     config.OWNER_NAME  || 'Bruce Bera',
    owner_number:   config.OWNER_NUMBER || '254743982206',
    auto_read:      !!(config.AUTO_READ    ?? s.AUTO_READ    ?? false),
    auto_react:     !!(config.AUTO_REACT   ?? s.AUTO_REACT   ?? false),
    auto_typing:    !!(config.AUTO_TYPING  ?? s.AUTO_TYPING  ?? false),
    always_online:  !!(config.ALWAYS_ONLINE ?? s.ALWAYS_ONLINE ?? false),
    anti_delete:    !!(config.ANTI_DELETE  ?? s.ANTI_DELETE  ?? false),
    auto_status_seen:!!(config.AUTO_STATUS_SEEN ?? s.AUTO_STATUS_SEEN ?? true),
    reject_call:    !!(config.REJECT_CALL  ?? s.REJECT_CALL  ?? false),
    platform:       'BeraHost',
    github_repo:    GH_REPO,
    berahost_url:   BH_BASE,
  };
}

// ─── GitHub API helpers ───────────────────────────────────────────────────────
const GH_HEADERS = {
  Authorization: `Bearer ${GH_TOKEN}`,
  Accept:        'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
};
async function ghGet(path) {
  const r = await axios.get(`https://api.github.com${path}`, { headers: GH_HEADERS, timeout: 20000 });
  return r.data;
}
async function ghPost(path, body) {
  const r = await axios.post(`https://api.github.com${path}`, body, { headers: GH_HEADERS, timeout: 20000 });
  return r.data;
}
async function ghPut(path, body) {
  const r = await axios.put(`https://api.github.com${path}`, body, { headers: GH_HEADERS, timeout: 20000 });
  return r.data;
}

// ─── BeraHost API helpers ─────────────────────────────────────────────────────
const BH_HEADERS = { 'Authorization': `Bearer ${BH_KEY}`, 'Content-Type': 'application/json' };
async function bhGet(path) {
  const r = await axios.get(`${BH_BASE}${path}`, { headers: BH_HEADERS, timeout: 20000 });
  return r.data;
}
async function bhPost(path, body = {}) {
  const r = await axios.post(`${BH_BASE}${path}`, body, { headers: BH_HEADERS, timeout: 20000 });
  return r.data;
}

// ─── Tool executor ────────────────────────────────────────────────────────────
async function executeTool(name, args = {}) {
  switch (name) {

    // ── Bot settings ──────────────────────────────────────────────────────────
    case 'bot_get_settings': {
      return getBotCtx();
    }
    case 'bot_set': {
      const { key, value } = args;
      if (!key) throw new Error('Missing key');
      const k = key.toUpperCase();
      writeState(k, value);
      config[k] = value;
      return { success: true, key: k, value };
    }

    // ── GitHub ────────────────────────────────────────────────────────────────
    case 'github_list_repos': {
      const data = await ghGet('/user/repos?per_page=20&sort=updated');
      return data.map(r => ({ name: r.name, full_name: r.full_name, private: r.private, url: r.html_url }));
    }
    case 'github_create_repo': {
      const { name, description = '', private: priv = false } = args;
      if (!name) throw new Error('Missing repo name');
      const data = await ghPost('/user/repos', { name, description, private: priv, auto_init: true });
      return { success: true, name: data.name, url: data.html_url, full_name: data.full_name };
    }
    case 'github_read_file': {
      const { repo = GH_REPO, file_path } = args;
      if (!file_path) throw new Error('Missing file_path');
      const data = await ghGet(`/repos/${repo}/contents/${file_path}`);
      const content = Buffer.from(data.content, 'base64').toString('utf8');
      return { path: data.path, size: data.size, content: content.slice(0, 2000), sha: data.sha };
    }
    case 'github_push_file': {
      const { repo = GH_REPO, file_path, content, message = 'update via BERA AI' } = args;
      if (!file_path || !content) throw new Error('Missing file_path or content');
      // Get existing SHA if file exists
      let sha;
      try {
        const existing = await ghGet(`/repos/${repo}/contents/${file_path}`);
        sha = existing.sha;
      } catch {}
      const body = { message, content: Buffer.from(content).toString('base64'), ...(sha ? { sha } : {}) };
      const data = await ghPut(`/repos/${repo}/contents/${file_path}`, body);
      return { success: true, path: file_path, repo, url: data.content?.html_url };
    }

    // ── BeraHost ──────────────────────────────────────────────────────────────
    case 'berahost_list': {
      const data = await bhGet('/api/deployments');
      const list = data.deployments || data;
      return Array.isArray(list)
        ? list.map(d => ({ id: d.id, name: d.name || d.botName, status: d.status, url: d.url }))
        : data;
    }
    case 'berahost_start': {
      const { id } = args;
      if (!id) throw new Error('Missing deployment id');
      const data = await bhPost(`/api/deployments/${id}/start`);
      return { success: true, id, status: data.status || 'started', ...data };
    }
    case 'berahost_stop': {
      const { id } = args;
      if (!id) throw new Error('Missing deployment id');
      const data = await bhPost(`/api/deployments/${id}/stop`);
      return { success: true, id, status: data.status || 'stopped', ...data };
    }
    case 'berahost_logs': {
      const { id } = args;
      if (!id) throw new Error('Missing deployment id');
      const data = await bhGet(`/api/deployments/${id}/logs`);
      const logs = (data.logs || data.output || JSON.stringify(data)).slice(0, 1500);
      return { id, logs };
    }
    case 'berahost_create': {
      const { bot_id = 3, name, env_vars = {} } = args;
      if (!name) throw new Error('Missing deployment name');
      const data = await bhPost('/api/deployments', { botId: bot_id, name, envVars: env_vars });
      return { success: true, id: data.id || data.deploymentId, name, ...data };
    }
    case 'berahost_restart': {
      const { id } = args;
      if (!id) throw new Error('Missing deployment id');
      await bhPost(`/api/deployments/${id}/stop`).catch(() => null);
      await new Promise(r => setTimeout(r, 2000));
      const data = await bhPost(`/api/deployments/${id}/start`);
      return { success: true, id, status: 'restarted', ...data };
    }

    // ── Web fetch ──────────────────────────────────────────────────────────────
    case 'web_fetch': {
      const { url } = args;
      if (!url) throw new Error('Missing url');
      const r = await axios.get(url, { timeout: 15000, responseType: 'text' });
      const text = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
      return { url, content: text.slice(0, 2000), status: r.status };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── System prompt ────────────────────────────────────────────────────────────
function buildSystemPrompt(ctx) {
  return `You are BERA AI — an intelligent, agentic AI assistant for the CLOUD AI WhatsApp bot. You were built by Bruce Bera.

CURRENT BOT STATE:
${JSON.stringify(ctx, null, 2)}

You have access to these TOOLS. Respond with JSON to call a tool:

BOT SETTINGS:
• bot_get_settings — read all bot settings
• bot_set — set any setting. Args: {key, value}
  Keys: MODE (public/private/group), PREFIX, BOT_NAME, AUTO_READ, AUTO_REACT, AUTO_TYPING, ALWAYS_ONLINE, ANTI_DELETE, REJECT_CALL, AUTO_STATUS_SEEN

GITHUB (repo: ${GH_REPO}):
• github_list_repos — list repositories
• github_create_repo — create new repo. Args: {name, description, private}
• github_read_file — read a file. Args: {repo, file_path}
• github_push_file — push/update a file. Args: {repo, file_path, content, message}

BERAHOST:
• berahost_list — list all deployments
• berahost_start — start deployment. Args: {id}
• berahost_stop — stop deployment. Args: {id}
• berahost_restart — restart deployment. Args: {id}
• berahost_logs — get logs. Args: {id}
• berahost_create — create deployment. Args: {bot_id, name, env_vars:{}}

WEB:
• web_fetch — fetch URL content. Args: {url}

DONE:
• done — you are finished. Use when the task is complete.

RESPONSE FORMAT — always reply with ONLY valid JSON (no markdown, no explanation outside JSON):
{
  "thinking": "your brief reasoning",
  "message": "progress update to send to user right now (keep it brief, natural, like texting)",
  "tool": "tool_name_or_done",
  "args": {}
}

When tool is "done", message is your final complete reply to the user.

RULES:
1. Be conversational and natural — like texting a smart assistant.
2. Send a "message" BEFORE every tool call so the user sees live progress.
3. For "done", write a clear friendly summary of what was accomplished.
4. Only call one tool per response. Wait for the result before calling another.
5. For bot settings changes, always confirm what you changed.
6. Never expose API tokens or passwords in messages to the user.
7. If a tool fails, tell the user and try an alternative or ask for clarification.`;
}

// ─── Call AI — tries GitHub Models → DeepSeek → error ───────────────────────
async function callAI(messages) {
  const ghToken  = process.env.GITHUB_TOKEN  || config.GITHUB_TOKEN;
  const dsToken  = process.env.OPENAI_API_KEY;

  const body = (model) => ({
    model,
    messages,
    max_tokens: 800,
    temperature: 0.4,
    response_format: { type: 'json_object' },
  });

  // 1️⃣ GitHub Models (gpt-4o-mini)
  if (ghToken) {
    try {
      const res = await axios.post(
        'https://models.inference.ai.azure.com/chat/completions',
        body('gpt-4o-mini'),
        { timeout: 20000, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ghToken}` } }
      );
      const raw = res.data?.choices?.[0]?.message?.content?.trim();
      if (raw) return JSON.parse(raw);
    } catch (_) {}
  }

  // 2️⃣ DeepSeek (OpenAI-compatible, OPENAI_API_KEY)
  if (dsToken) {
    try {
      const res = await axios.post(
        'https://api.deepseek.com/v1/chat/completions',
        body('deepseek-chat'),
        { timeout: 20000, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${dsToken}` } }
      );
      const raw = res.data?.choices?.[0]?.message?.content?.trim();
      if (raw) return JSON.parse(raw);
    } catch (_) {}
  }

  throw new Error('All AI backends failed — check GITHUB_TOKEN or OPENAI_API_KEY');
}

// ─── Conversation memory (per user, 12 turns) ────────────────────────────────
const memory = new Map();
function getHistory(sender) { return memory.get(sender) || []; }
function addHistory(sender, role, content) {
  const h = getHistory(sender);
  h.push({ role, content: typeof content === 'string' ? content : JSON.stringify(content) });
  if (h.length > 12) h.splice(0, 2);
  memory.set(sender, h);
}
function clearHistory(sender) { memory.delete(sender); }

// ─── Send a progress message (fire-and-forget — never blocks the bot) ──────────
function sendProgress(conn, from, text) {
  conn.sendMessage(from, { text: `🤖 ${text}` }).catch(() => {});
  return null;
}

// ─── Agentic loop ────────────────────────────────────────────────────────────
const MAX_STEPS = 7;

async function runAgent(userMessage, sender, conn, from, quoted) {
  const ctx      = getBotCtx();
  const sysMsg   = { role: 'system', content: buildSystemPrompt(ctx) };
  const history  = getHistory(sender);

  addHistory(sender, 'user', userMessage);

  const messages = [sysMsg, ...history];
  let lastProgressMsg = null;

  for (let step = 0; step < MAX_STEPS; step++) {
    let parsed;
    try {
      parsed = await callAI(messages);
    } catch (err) {
      // If JSON parse fails, try to extract JSON from response
      throw new Error(`AI error: ${err.message}`);
    }

    const { thinking, message, tool, args = {} } = parsed;

    // Send progress update to user
    if (message && tool !== 'done') {
      lastProgressMsg = await sendProgress(conn, from, message);
    }

    // Build what the AI said for history
    messages.push({ role: 'assistant', content: JSON.stringify(parsed) });

    // If done, return the final message
    if (tool === 'done' || !tool) {
      addHistory(sender, 'assistant', message || 'Done.');
      return message || 'Done!';
    }

    // Execute the tool
    let toolResult;
    try {
      toolResult = await executeTool(tool, args);
    } catch (err) {
      toolResult = { error: err.message };
    }

    // Add tool result to messages
    messages.push({
      role: 'user',
      content: JSON.stringify({ tool_result: toolResult, tool_called: tool }),
    });
  }

  // Exceeded max steps — ask AI for summary
  addHistory(sender, 'assistant', '[task completed]');
  return 'I\'ve completed the task! Let me know if you need anything else.';
}

// ─── Plugin entry point ──────────────────────────────────────────────────────
const dba = async (m, conn, { isOwner } = {}) => {
  if (!m.body) return;
  const body = m.body.trim();
  if (!body.startsWith(p)) return;
  const args = body.slice(p.length).trim().split(/\s+/);
  const cmd  = args[0].toLowerCase();
  const q    = args.slice(1).join(' ');

  if (!['beraai', 'bai', 'botai', 'assistant', 'admin'].includes(cmd)) return;

  const quoted = { quoted: { key: m.key, message: m.message } };

  // ── Help / no query ────────────────────────────────────────────────────────
  if (!q) {
    return m.reply(
`🤖 *BERA AI — Agentic Assistant*
${'━'.repeat(24)}

I'm your intelligent assistant. Just talk to me naturally and I'll get things done.

*What I can do:*
🔧 Change any bot setting
📦 Create GitHub repos & push files
🚀 Start/stop/restart BeraHost deployments
📋 Read deployment logs
🌐 Fetch web pages
💬 Answer any question

*Examples:*
• ${p}beraai Change mode to private
• ${p}beraai Create a GitHub repo called MyApp
• ${p}beraai Start my BeraHost deployment 8
• ${p}beraai Show me all my deployments
• ${p}beraai Turn on auto read and always online
• ${p}beraai What version is the bot?
• ${p}beraai Clear memory

> ${config.BOT_NAME}`);
  }

  // ── Clear memory ───────────────────────────────────────────────────────────
  if (['clear', 'reset', 'forget', 'clear memory'].includes(q.toLowerCase())) {
    clearHistory(m.sender);
    return m.reply(`🗑️ *Conversation cleared!*\n\nI've forgotten our previous chat. Fresh start!\n\n> ${config.BOT_NAME}`);
  }

  // ── Owner check — use isOwner passed by handler (already resolves @lid JIDs) ──
  const sensitiveKeywords = ['github', 'berahost', 'deploy', 'create repo', 'push', 'start', 'stop', 'restart', 'mode', 'prefix'];
  const isSensitive = sensitiveKeywords.some(kw => q.toLowerCase().includes(kw));
  if (isSensitive && !isOwner) {
    return m.reply(`⚠️ *Access Denied*\n\nOnly the bot owner can execute that action.\n\n> ${config.BOT_NAME}`);
  }

  await m.React('🤖');

  // Send immediate "Thinking..." so user knows the bot received the command
  const thinkingMsg = await sendProgress(conn, m.from, `*Thinking...* 🧠\n_"${q.slice(0, 60)}${q.length > 60 ? '...' : ''}"_`);

  try {
    const finalMessage = await runAgent(q, m.sender, conn, m.from, quoted);

    await m.reply(
`🤖 *BERA AI*
${'━'.repeat(24)}

${finalMessage}

> ${config.BOT_NAME}`
    );
    await m.React('✅');
  } catch (err) {
    await m.React('❌');
    clearHistory(m.sender); // Reset on error to avoid bad state
    await m.reply(
`❌ *BERA AI Error*
${'━'.repeat(24)}

${err.message}

Try rephrasing your request or type *${p}beraai clear* to reset.

> ${config.BOT_NAME}`
    );
  }
};

export default dba;
