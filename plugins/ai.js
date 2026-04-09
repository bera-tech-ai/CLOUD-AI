import config from '../config.cjs';
import axios from 'axios';
import { sendBtn } from '../lib/sendBtn.js';
import { translateText as beraTranslate } from '../lib/beraapi.js';

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

// ─── GitHub Models → model name mapping ─────────────────────────────────────
const GH_MODEL_MAP = {
  'openai': 'gpt-4o-mini',
  'openai-large': 'gpt-4o',
  'claude-hybridspace': 'gpt-4o',   // fallback — GitHub doesn't have Claude
  'llama': 'Meta-Llama-3.1-70B-Instruct',
  'mistral': 'Mistral-large-2407',
  'phi': 'Phi-3.5-MoE-instruct',
};

// ─── Call AI via GitHub Models (free with GITHUB_TOKEN) ──────────────────────
async function callPollinationsAI(prompt, pollinationsModel = 'openai') {
  const ghModel = GH_MODEL_MAP[pollinationsModel] || 'gpt-4o-mini';
  const ghToken = process.env.GITHUB_TOKEN;
  const dsToken = process.env.OPENAI_API_KEY;
  const sysmsg  = {
    role: 'system',
    content: `You are ${config.BOT_NAME}, a helpful and intelligent WhatsApp AI assistant created by ${config.OWNER_NAME}. Be concise, friendly and helpful. Keep responses under 1500 characters when possible.`,
  };

  // 1️⃣ GitHub Models (primary)
  if (ghToken) {
    try {
      const res = await axios.post(
        'https://models.inference.ai.azure.com/chat/completions',
        { model: ghModel, messages: [sysmsg, { role: 'user', content: prompt }], max_tokens: 1000, temperature: 0.7 },
        { timeout: 20000, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ghToken}` } }
      );
      const txt = res.data?.choices?.[0]?.message?.content?.trim();
      if (txt) return txt;
    } catch (_) {}
  }

  // 2️⃣ DeepSeek (secondary — OPENAI_API_KEY)
  if (dsToken) {
    try {
      const res = await axios.post(
        'https://api.deepseek.com/v1/chat/completions',
        { model: 'deepseek-chat', messages: [sysmsg, { role: 'user', content: prompt }], max_tokens: 1000, temperature: 0.7 },
        { timeout: 20000, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${dsToken}` } }
      );
      const txt = res.data?.choices?.[0]?.message?.content?.trim();
      if (txt) return txt;
    } catch (_) {}
  }

  throw new Error('AI unavailable — check GITHUB_TOKEN or OPENAI_API_KEY');
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
    // Instant feedback — user sees this while AI is thinking
    await conn.sendMessage(m.from, { text: `🤖 *Thinking...* 🧠` }).catch(() => {});
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

  // ─── TRANSLATE (Bera API → Pollinations fallback) ─────────────────────────
  if (['translate', 'tr', 'tl'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${p}translate <language> <text>\n\nExample: ${p}translate sw Hello World\n\n> ${config.BOT_NAME}`);
    const parts = q.split(' ');
    const lang = parts[0];
    const text = parts.slice(1).join(' ');
    if (!text) return m.reply(`❌ Provide text to translate!\n\nUsage: ${p}translate <lang-code> <text>\n\nExamples:\n• ${p}translate sw Good morning\n• ${p}translate fr How are you?\n• ${p}translate es Hello friend\n\n> ${config.BOT_NAME}`);

    await m.React('🌐');
    try {
      let translated, fromLang;
      try {
        const r = await beraTranslate(text, lang);
        translated = r.translated;
        fromLang = r.from;
      } catch {
        translated = await translateText(text, lang);
        fromLang = 'auto';
      }
      if (!translated) throw new Error('No translation returned');
      await m.reply(`🌐 *Translation*\n${'━'.repeat(22)}\n\n📝 *Original (${fromLang}):*\n${text}\n\n✅ *Translated (${lang}):*\n${translated}\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Translation failed: ${err.message}\n\n> ${config.BOT_NAME}`);
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
