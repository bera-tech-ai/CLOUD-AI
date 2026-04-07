import pkg from '@whiskeysockets/baileys';
const { getContentType, jidNormalizedUser, proto } = pkg;

// Global LID → phone JID map (populated from contacts.upsert events)
export const lidMap = new Map();

export function decodeJid(jid) {
  if (!jid) return jid;
  if (/:\d+@/gi.test(jid)) {
    const decode = jidNormalizedUser(jid);
    return decode;
  } else return jid;
}

// Resolve @lid JID to real phone JID if possible, else return original
export function resolveLid(jid) {
  if (!jid) return jid;
  if (jid.endsWith('@lid')) {
    return lidMap.get(jid) || jid;
  }
  return jid;
}

export async function serialize(msg, conn) {
  const m = {};

  if (!msg.message) return null;
  if (msg.key && msg.key.remoteJid === 'status@broadcast') return null;

  m.message = msg.message;

  // Basic info
  m.key = msg.key;
  m.from = msg.key.remoteJid; // keep as-is, @lid is fine for sending in baileys-pro
  m.fromMe = msg.key.fromMe;
  m.id = msg.key.id;
  m.device = /^3A/.test(m.id) ? 'ios' : /^3E/.test(m.id) ? 'web' : /^.{21}/.test(m.id) ? 'android' : 'unknown';
  m.isGroup = m.from.endsWith('@g.us');
  m.sender = decodeJid(m.fromMe ? conn.user.id : m.isGroup ? msg.key.participant : m.from);
  m.pushName = msg.pushName || '';

  // Message type
  m.type = getContentType(msg.message);

  // Quoted
  const quoted = msg.message[m.type]?.contextInfo?.quotedMessage;
  m.quoted = quoted ? {
    type: getContentType(quoted),
    message: quoted,
    key: {
      id: msg.message[m.type]?.contextInfo?.stanzaId,
      fromMe: msg.message[m.type]?.contextInfo?.participant === conn.user.id,
      remoteJid: m.from,
    },
    sender: decodeJid(msg.message[m.type]?.contextInfo?.participant),
    text: quoted?.conversation || quoted?.extendedTextMessage?.text || '',
  } : null;

  // Mentions
  m.mentionedJid = msg.message[m.type]?.contextInfo?.mentionedJid || [];

  // Body text
  m.body = msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    msg.message?.documentWithCaptionMessage?.message?.documentMessage?.caption ||
    msg.message?.buttonsResponseMessage?.selectedButtonId ||
    msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    msg.message?.templateButtonReplyMessage?.selectedId || '';

  // Handle interactive button responses (button clicks)
  const nativeFlowParams = msg.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  if (nativeFlowParams && !m.body) {
    try {
      const params = JSON.parse(nativeFlowParams);
      m.selectedId = params.id || '';
      m.selectedTitle = params.title || params.display_text || '';
      m.body = m.selectedId || nativeFlowParams;
    } catch {
      m.selectedId = '';
      m.selectedTitle = '';
      m.body = m.body || nativeFlowParams;
    }
  }

  // Also handle viewOnce interactive responses
  const viewOnceInteractive = msg.message?.viewOnceMessage?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  if (viewOnceInteractive && !m.body) {
    try {
      const params = JSON.parse(viewOnceInteractive);
      m.selectedId = params.id || '';
      m.body = m.selectedId || viewOnceInteractive;
    } catch {
      m.body = m.body || viewOnceInteractive;
    }
  }

  // ─── Determine if "quoted" is safe to use ─────────────────────────────────
  // Quoting a message whose participant is still an unresolved @lid JID causes
  // Baileys to time out (it tries to look up the @lid and hangs).
  // Fix: only pass quoted when the participant JID is a real phone number.
  const groupParticipant = m.isGroup ? msg.key.participant : null;
  const participantIsLid = groupParticipant?.endsWith('@lid') && !lidMap.has(groupParticipant);
  const canQuote = !participantIsLid;

  // Raw Baileys message — set to null when it's unsafe to use as quoted
  m.raw = canQuote ? msg : null;
  m._rawMsg = msg; // always kept for non-quoted uses

  // ─── Reply helper ───────────────────────────────────────────────────────────
  // Sends to m.from (works with both @lid and @s.whatsapp.net in baileys-pro).
  m.reply = async (text, options = {}) => {
    const target = m.from;
    // Try with quoted first (only if safe)
    if (canQuote) {
      try {
        return await conn.sendMessage(target, { text: String(text), ...options }, { quoted: msg });
      } catch (_) {}
    }
    // Fallback: plain send without quoted
    try {
      return await conn.sendMessage(target, { text: String(text), ...options });
    } catch (err) {
      console.error('[REPLY ERROR]', err?.message);
    }
  };

  // React helper
  m.React = (emoji) => conn.sendMessage(m.from, { react: { text: emoji, key: msg.key } }).catch(() => {});

  // Sticker check
  m.isSticker = m.type === 'stickerMessage';

  return m;
}
