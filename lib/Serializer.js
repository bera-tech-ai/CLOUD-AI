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

// Resolve @lid JID to real phone JID if possible
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
  m.from = resolveLid(msg.key.remoteJid); // resolve @lid → real phone JID
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
      // Use the button id as the body so commands work
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

  // Reply helper — try with quoted, fall back to plain if it fails (handles @lid JIDs)
  m.reply = async (text, options = {}) => {
    try {
      return await conn.sendMessage(m.from, { text: String(text), ...options }, { quoted: msg });
    } catch (_) {
      try {
        return await conn.sendMessage(m.from, { text: String(text), ...options });
      } catch (err) {
        console.error('[REPLY ERROR]', err?.message);
      }
    }
  };

  // React helper
  m.React = (emoji) => conn.sendMessage(m.from, { react: { text: emoji, key: msg.key } }).catch(() => {});

  // Raw Baileys message (used by sendBtn for quoted)
  m.raw = msg;

  // Sticker check
  m.isSticker = m.type === 'stickerMessage';

  return m;
}
