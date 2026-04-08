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

  // DEBUG: log full key for @lid messages to understand what fields baileys-pro provides
  if (msg.key?.remoteJid?.endsWith('@lid') && !msg.key?.fromMe) {
    console.log('[DEBUG @lid KEY]', JSON.stringify({
      remoteJid: msg.key.remoteJid,
      fromMe: msg.key.fromMe,
      participant: msg.key.participant,
      senderPn: msg.key.senderPn,
      participantPn: msg.key.participantPn,
      remoteJidAlt: msg.key.remoteJidAlt,
      participantAlt: msg.key.participantAlt,
      pushName: msg.pushName,
      allKeyFields: Object.keys(msg.key),
      allMsgFields: Object.keys(msg).filter(k => k !== 'message'),
    }));
  }

  // Basic info
  m.key = msg.key;
  m.from = msg.key.remoteJid; // keep as-is, @lid is fine for sending in baileys-pro
  m.fromMe = msg.key.fromMe;
  m.id = msg.key.id;
  m.device = /^3A/.test(m.id) ? 'ios' : /^3E/.test(m.id) ? 'web' : /^.{21}/.test(m.id) ? 'android' : 'unknown';
  m.isGroup = m.from.endsWith('@g.us');
  // Try to get real phone JID for DM @lid chats - check participantPn/senderPn (baileys-pro adds these)
  const _realDmJid = !m.isGroup && !m.fromMe
    ? (msg.key.senderPn || msg.key.participantPn || msg.key.remoteJidAlt || null)
    : null;
  m.sender = decodeJid(m.fromMe ? conn.user.id : m.isGroup ? msg.key.participant : (_realDmJid || m.from));
  // Store the real phone JID for DMs so sendBtn can route interactive messages correctly
  m.realJid = _realDmJid ? decodeJid(_realDmJid) : (!m.isGroup ? m.sender : m.from);
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
  // For DMs: use m.sender (resolved via senderPn) not m.from (which may be @lid).
  // For groups: use m.from (group JID). Never quote in groups (causes timeouts).
  m.reply = async (text, options = {}) => {
    const target = m.isGroup ? m.from : m.sender;

    // Helper: send with a 10s timeout so @lid hangs don't block the bot
    const sendSafe = (jid, payload, quotedMsg) => {
      const sendPromise = quotedMsg
        ? conn.sendMessage(jid, payload, { quoted: quotedMsg })
        : conn.sendMessage(jid, payload);
      return Promise.race([
        sendPromise,
        new Promise((_, rej) => setTimeout(() => rej(new Error('Timed Out')), 10000)),
      ]);
    };

    // DMs only: try with quoted first (if safe)
    if (!m.isGroup && canQuote) {
      try { return await sendSafe(target, { text: String(text), ...options }, msg); } catch (_) {}
    }

    // Plain send (groups always, DM fallback)
    try {
      return await sendSafe(target, { text: String(text), ...options });
    } catch (err) {
      // If m.sender also failed (still @lid), try m.from as last resort
      if (target !== m.from) {
        try { return await sendSafe(m.from, { text: String(text), ...options }); } catch (_) {}
      }
      console.error('[REPLY ERROR]', err?.message);
    }
  };

  // React helper — strip participant from key in groups to avoid @lid timeout
  m.React = (emoji) => {
    const reactKey = m.isGroup
      ? { id: msg.key.id, remoteJid: msg.key.remoteJid, fromMe: msg.key.fromMe, participant: msg.key.participant }
      : msg.key;
    conn.sendMessage(m.from, { react: { text: emoji, key: reactKey } }).catch(() => {});
  };

  // Sticker check
  m.isSticker = m.type === 'stickerMessage';

  return m;
}
