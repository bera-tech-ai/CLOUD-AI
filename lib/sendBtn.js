/**
 * Interactive button sender.
 *
 * Strategy: Send raw interactiveMessage WITHOUT viewOnce wrapper.
 *
 * viewOnce auto-dismisses in self-chats ("Message yourself") before you can tap.
 * We call relayMessage directly with a plain interactiveMessage so it stays visible.
 *
 * Image is intentionally NOT included in the button message — caller should send
 * the image/card as a separate plain message first (avoids waUploadToServer issues).
 *
 * Fallback chain:
 * 1. relayMessage with plain interactiveMessage (no viewOnce, no image)
 * 2. sendButtons from gifted-btns (has viewOnce — works in normal chats at least)
 * 3. Plain text list
 */
import { createRequire } from 'module';
import { lidMap } from './Serializer.js';

const _require = createRequire(import.meta.url);
const { sendButtons } = _require('gifted-btns');

import pkg from '@whiskeysockets/baileys';
const { generateMessageID, generateWAMessageFromContent } = pkg;

// ─── Resolve any residual @lid JID ───────────────────────────────────────────
function resolveJid(jid) {
  if (!jid) return jid;
  if (!jid.endsWith('@lid')) return jid;
  const real = lidMap.get(jid);
  return (real && !real.endsWith('@lid')) ? real : jid;
}

// ─── Convert buttons to native flow format ────────────────────────────────────
function toNativeBtns(buttons) {
  return buttons.map((b, i) => ({
    name: b.name || 'quick_reply',
    buttonParamsJson: b.buttonParamsJson ?? JSON.stringify({
      display_text: b.text || b.displayText || `Option ${i + 1}`,
      id: b.id || b.buttonId || `btn_${i}`,
    }),
  }));
}

// ─── Attempt 1: relay plain interactiveMessage (NO viewOnce, NO image) ────────
async function sendRawInteractive(conn, jid, { body, footer, buttons }) {
  const nativeBtns = toNativeBtns(buttons);

  // Generate a message ID without calling generateMessageID (avoids internal baileys issues)
  const msgId = `3A${Math.random().toString(36).slice(2, 12).toUpperCase()}${Date.now().toString(36).toUpperCase()}`;

  // Call relayMessage directly — no generateWAMessageFromContent (avoids null from device metadata)
  await conn.relayMessage(jid, {
    interactiveMessage: {
      body: { text: body || '' },
      footer: { text: footer || '' },
      nativeFlowMessage: {
        buttons: nativeBtns,
      },
    },
  }, {
    messageId: msgId,
    additionalNodes: [{ tag: 'biz', attrs: {}, content: undefined }],
  });
  return true;
}

/**
 * Send an interactive button message.
 *
 * NOTE: Do NOT pass `image` here — send your thumbnail as a separate plain
 * image message BEFORE calling sendBtn. This keeps sendBtn simple and avoids
 * the waUploadToServer issue.
 */
export async function sendBtn(conn, jid, options = {}, quotedMsg) {
  const { body = '', footer = '', buttons = [], title = '', image } = options;

  const realJid = resolveJid(jid);

  if (buttons.length === 0) {
    // Nothing to send as interactive
    await conn.sendMessage(realJid, { text: body }).catch(() => {});
    return true;
  }

  // ── Attempt 1: raw relayMessage WITHOUT viewOnce ──────────────────────────
  try {
    await sendRawInteractive(conn, realJid, { body, footer, buttons });
    console.log('[sendBtn] ✅ raw interactive OK →', realJid);
    return true;
  } catch (err) {
    console.error('[sendBtn] raw interactive failed:', err?.message);
  }

  // ── Attempt 2: gifted-btns sendButtons (has viewOnce) ────────────────────
  try {
    const simpleButtons = buttons.map((b, i) => {
      if (b.id && b.text) return { id: b.id, text: b.text };
      return { id: `btn_${i}`, text: String(b.text || b.displayText || `Option ${i + 1}`) };
    });

    await sendButtons(conn, realJid, {
      title,
      text: body,
      footer,
      ...(image ? { image: typeof image === 'string' ? { url: image } : image } : {}),
      buttons: simpleButtons,
    });
    console.log('[sendBtn] ✅ gifted-btns OK →', realJid);
    return true;
  } catch (err) {
    console.error('[sendBtn] gifted-btns failed:', err?.message);
  }

  // ── Fallback: numbered text list ─────────────────────────────────────────
  const btnLines = buttons.map((b, i) => `*${i + 1}.* ${b.text || b.displayText || `Option ${i + 1}`}`).join('\n');
  const fullText = `${body}\n\n${btnLines}${footer ? `\n\n_${footer}_` : ''}`;
  try {
    if (image) {
      const imgUrl = typeof image === 'string' ? image : image?.url;
      await conn.sendMessage(realJid, { image: { url: imgUrl }, caption: fullText });
    } else {
      await conn.sendMessage(realJid, { text: fullText });
    }
    console.log('[sendBtn] ✅ text fallback OK →', realJid);
    return true;
  } catch (err) {
    console.error('[sendBtn] ALL fallbacks failed:', err?.message);
  }

  return false;
}

/**
 * Send a list/menu message.
 */
export async function sendList(conn, jid, options = {}) {
  const { title = '', body = '', footer = '', buttonText = '☰ Open Menu', sections = [] } = options;
  const realJid = resolveJid(jid);

  try {
    const nativeBtns = [{
      name: 'single_select',
      buttonParamsJson: JSON.stringify({ title: buttonText, sections }),
    }];
    const msgContent = {
      interactiveMessage: {
        body: { text: body },
        footer: { text: footer },
        nativeFlowMessage: { buttons: nativeBtns },
      },
    };
    const waMsg = generateWAMessageFromContent(realJid, msgContent, { userJid: conn.user?.id });
    await conn.relayMessage(realJid, waMsg.message, {
      messageId: waMsg.key.id,
      additionalNodes: [{ tag: 'biz', attrs: {}, content: undefined }],
    });
    return;
  } catch (_) {}

  const rows = sections.flatMap(s => s.rows || []);
  const text = `*${title}*\n\n${body}\n\n${rows.map((r, i) => `${i + 1}. ${r.title}`).join('\n')}${footer ? `\n\n_${footer}_` : ''}`;
  await conn.sendMessage(realJid, { text }).catch(() => {});
}
