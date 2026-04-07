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

// Check if a JID is still unresolved @lid
function isLid(jid) {
  return jid && jid.endsWith('@lid');
}

export async function serialize(msg, conn) {
  const m = {};

  if (!msg.message) return null;
  if (msg.key && msg.key.remoteJid === 'status@broadcast') return null;

  m.message = msg.message;

  // Basic info
  m.key = msg.key;

  // Resolve @lid for the chat JID
  const rawFrom = msg.key.remoteJid;
  m.from = resolveLid(rawFrom);

  m.fromMe = msg.key.fromMe;
  m.id = msg.key.id;
  m.device = /^3A/.test(m.id) ? 'ios' : /^3E/.test(m.id) ? 'web' : /^.{21}/.test(m.id) ? 'android' : 'unknown';
  m.isGroup = m.from.endsWith('@g.us');
  m.sender = decodeJid(m.fromMe ? conn.user.id : m.isGroup ? msg.key.participant : m.from);

  // Resolve sender @lid → phone JID
  m.sender = resolveLid(m.sender);

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
    sender: decodeJid(resolveLid(msg.message[m.type]?.contextInfo?.participant)),
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

  // ─── Build a safe "raw" reference for quoted replies ───────────────────────
  // If the participant JID is still @lid, drop the quoted option to avoid
  // Baileys timing out when it can't resolve the @lid → phone JID mapping.
  const participantIsLid = m.isGroup && isLid(msg.key.participant);
  const fromIsLid = isLid(m.from);

  // Resolved raw: patch the participant if we have a resolution
  let safeRaw = msg;
  if (m.isGroup && msg.key.participant) {
    const resolvedParticipant = resolveLid(msg.key.participant);
    if (resolvedParticipant !== msg.key.participant) {
      safeRaw = { ...msg, key: { ...msg.key, participant: resolvedParticipant } };
    }
  }

  // Raw Baileys message — used by sendBtn for quoted, null if unusable
  m.raw = (participantIsLid || fromIsLid) ? null : safeRaw;
  m._rawAlways = safeRaw; // always available for non-quoted uses

  // Reply helper
  m.reply = async (text, options = {}) => {
    // Resolve @lid from JID before attempting to send
    let target = m.from;
    if (isLid(target)) {
      const resolved = resolveLid(target);
      if (isLid(resolved)) {
        console.error('[REPLY ERROR] Unresolvable @lid:', target);
        return;
      }
      target = resolved;
    }

    // Only quote if we have a safe (non-@lid) raw message
    const quotedMsg = m.raw ? safeRaw : undefined;

    try {
      if (quotedMsg) {
        return await conn.sendMessage(target, { text: String(text), ...options }, { quoted: quotedMsg });
      } else {
        return await conn.sendMessage(target, { text: String(text), ...options });
      }
    } catch (_) {
      try {
        return await conn.sendMessage(target, { text: String(text), ...options });
      } catch (err) {
        console.error('[REPLY ERROR]', err?.message);
      }
    }
  };

  // React helper — resolve @lid before reacting
  m.React = (emoji) => {
    let target = m.from;
    if (isLid(target)) {
      const resolved = resolveLid(target);
      if (isLid(resolved)) return Promise.resolve();
      target = resolved;
    }
    return conn.sendMessage(target, { react: { text: emoji, key: safeRaw.key } }).catch(() => {});
  };

  // Sticker check
  m.isSticker = m.type === 'stickerMessage';

  return m;
}
