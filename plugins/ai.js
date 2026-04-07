import config from '../config.cjs';
import axios from 'axios';
import { sendBtn } from '../lib/sendBtn.js';

const p = config.PREFIX;

// ─── Model map: cmd → Pollinations model name ───────────────────────────────
const MODEL_MAP = {
  ai: 'openai',         giftedai: 'openai',      chatai: 'openai',
  gpt: 'openai',        chatgpt: 'openai',       gpt4: 'openai-large',
  gpt4o: 'openai-large', 'gpt4o-mini': 'openai',
  gemini: 'openai-large',
  claude: 'claude-hybridspace',
  llama: 'llama',
  mistral: 'mistral',
  deepseek: 'deepseek',
  qwen: 'qwen-coder',
  phi: 'phi',
  grok: 'openai-large',
  openai: 'openai-large',
  venice: 'mistral',
  blackbox: 'openai',
  letmegpt: 'openai',
};

// ─── Display labels ───────────────────────────────────────────────────────────
const AI_LABEL = {
  ai: '🤖 CLOUD AI',      giftedai: '🤖 CLOUD AI',   chatai: '🤖 CLOUD AI',
  gpt: '🧠 GPT-3.5',      chatgpt: '🧠 GPT-3.5',     gpt4: '🧠 GPT-4',
  gpt4o: '🧠 GPT-4o',     'gpt4o-mini': '🧠 GPT-4o Mini',
  gemini: '✨ Gemini',
  claude: '🎼 Claude',
  llama: '🦙 LLaMA',
  mistral: '🌀 Mistral',
  deepseek: '🔬 DeepSeek',
  qwen: '🌐 Qwen',
  phi: '📐 Phi',
  grok: '🤖 Grok',
  openai: '🔷 OpenAI',
  venice: '🎭 Venice',
  blackbox: '⬛ Blackbox',
  letmegpt: '🔍 LetMeGPT',
};

// ─── Call Pollinations.ai text API (free, no key) ────────────────────────────
async function callPollinationsAI(prompt, model = 'openai') {
  try {
    // POST method (more reliable for long prompts)
    const res = await axios.post(
      'https://text.pollinations.ai/openai',
      {
        model,
        messages: [
          {
            role: 'system',
            content: `You are ${config.BOT_NAME}, a helpful and intelligent WhatsApp AI assistant created by ${config.OWNER_NAME}. Be concise, friendly and helpful. Keep responses under 1500 characters when possible.`,
          },
          { role: 'user', content: prompt },
        ],
        max_tokens: 1000,
        temperature: 0.7,
      },
      {
        timeout: 60000,
        headers: { 'Content-Type': 'application/json' },
      }
    );
    return res.data?.choices?.[0]?.message?.content?.trim() || null;
  } catch (_) {}

  // GET fallback
  try {
    const encoded = encodeURIComponent(prompt);
    const res = await axios.get(
      `https://text.pollinations.ai/${encoded}?model=${model}&seed=-1`,
      { timeout: 45000, responseType: 'text' }
    );
    const text = typeof res.data === 'string' ? res.data.trim() : JSON.stringify(res.data);
    return text || null;
  } catch (e) {
    throw new Error(e?.response?.data || e.message || 'AI request failed');
  }
}

// ─── Translate using GiftedTech or fallback ──────────────────────────────────
async function translateText(text, targetLang) {
  // Use AI to translate
  const result = await callPollinationsAI(
    `Translate the following text to ${targetLang}. Reply with ONLY the translated text, no explanations:\n\n${text}`,
    'openai'
  );
  return result;
}

const aiPlugin = async (m, conn) => {
  if (!m.body) return;
  const body = m.body.trim();
  if (!body.startsWith(p)) return;
  const args = body.slice(p.length).trim().split(/\s+/);
  const cmd = args[0].toLowerCase();
  const q = args.slice(1).join(' ');

  // ─── AI CHAT COMMANDS ─────────────────────────────────────────────────────
  if (MODEL_MAP[cmd] !== undefined) {
    if (!q) {
      return m.reply(`${AI_LABEL[cmd] || '🤖 AI'}\n\n❌ *No question provided!*\n\nUsage: ${p}${cmd} <your question>\n\nExample: ${p}${cmd} What is quantum computing?\n\n> ${config.BOT_NAME}`);
    }

    await m.React('🤖');
    try {
      const model = MODEL_MAP[cmd];
      const result = await callPollinationsAI(q, model);
      if (!result) throw new Error('Empty response from AI');

      const label = AI_LABEL[cmd] || `🤖 ${cmd.toUpperCase()}`;
      await m.reply(`${label}\n\n${result}\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *AI Error*\n\n${err.message}\n\nTry: ${p}gpt4 ${q}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── TRANSLATE ────────────────────────────────────────────────────────────
  if (['translate', 'tr', 'tl'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${p}translate <language> <text>\n\nExample: ${p}translate swahili Hello World\n\n> ${config.BOT_NAME}`);
    const parts = q.split(' ');
    const lang = parts[0];
    const text = parts.slice(1).join(' ');
    if (!text) return m.reply(`❌ Provide text to translate!\n\nUsage: ${p}translate <language> <text>`);

    await m.React('🌐');
    try {
      const result = await translateText(text, lang);
      if (!result) throw new Error('No translation returned');
      await m.reply(`🌐 *Translation*\n\n📝 *Original:* ${text}\n🗣️ *Language:* ${lang}\n\n✅ *Result:*\n${result}\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Translation failed: ${err.message}`);
    }
    return;
  }

  // ─── LANG DETECT ─────────────────────────────────────────────────────────
  if (['lang', 'detectlang', 'language'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${p}lang <text>`);
    await m.React('🌍');
    try {
      const result = await callPollinationsAI(
        `Detect the language of this text and return ONLY the language name (e.g. "English", "Swahili", "French"):\n\n${q}`,
        'openai'
      );
      await m.reply(`🌍 *Language Detection*\n\n📝 *Text:* ${q}\n🔍 *Language:* ${result || 'Unknown'}\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Detection failed: ${err.message}`);
    }
    return;
  }
};

export default aiPlugin;
