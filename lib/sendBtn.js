/**
 * Interactive button sender — raw baileys first (no viewOnce), gifted-btns fallback.
 *
 * Root cause of buttons disappearing in "Message yourself" chat:
 *   gifted-btns wraps messages in viewOnceMessage, which WhatsApp auto-dismisses
 *   in self-chats before the user can tap any button.
 *
 * Fix: send raw interactiveMessage WITHOUT viewOnce wrapper. The biz additionalNode
 * is still required for WhatsApp to render native flow buttons.
 *
 * Fallback chain:
 * 1. Raw baileys interactiveMessage WITHOUT viewOnce  ← primary (works in self-chat)
 * 2. sendButtons (gifted-btns, has viewOnce)          ← for regular chats
 * 3. Image + numbered text options                    ← universal fallback
 */
import { createRequire } from 'module';
import { lidMap } from './Serializer.js';

const _require = createRequire(import.meta.url);
const { sendButtons } = _require('gifted-btns');

import pkg from '@whiskeysockets/baileys';
const { generateWAMessageFromContent, generateWAMessageContent, proto } = pkg;

// ─── Resolve any residual @lid JID ───────────────────────────────────────────
function resolveJid(jid) {
  if (!jid) return jid;
  if (!jid.endsWith('@lid')) return jid;
  const real = lidMap.get(jid);
  return (real && !real.endsWith('@lid')) ? real : jid;
}

// ─── Build native flow button objects ────────────────────────────────────────
function toNativeFlowBtns(buttons) {
  return buttons.map((b, i) => ({
    name: b.name || 'quick_reply',
    buttonParamsJson: b.buttonParamsJson ?? JSON.stringify({
      display_text: b.text || b.displayText || `Option ${i + 1}`,
      id: b.id || b.buttonId || `btn_${i}`,
    }),
  }));
}

// ─── Attempt 1: raw interactiveMessage WITHOUT viewOnce ───────────────────────
async function sendRawNaked(conn, jid, { body, footer, image, buttons }) {
  const nativeBtns = toNativeFlowBtns(buttons);

  // Build header (image optional)
  let header;
  if (image) {
    try {
      const src = typeof image === 'string' ? { url: image } : image;
      const imageContent = await generateWAMessageContent(
        { image: src },
        { upload: conn.waUploadToServer },
      );
      if (imageContent?.imageMessage) {
        header = { imageMessage: imageContent.imageMessage, hasMediaAttachment: true };
      }
    } catch (e) {
      console.warn('[sendBtn] image upload skipped:', e?.message);
    }
  }

  // Build the interactiveMessage directly (NO viewOnceMessage wrapper)
  const interactiveMsg = {
    body: { text: body || '' },
    footer: { text: footer || '' },
    nativeFlowMessage: { buttons: nativeBtns },
  };
  if (header) interactiveMsg.header = header;

  const msgContent = {
    messageContextInfo: {
      deviceListMetadata: {},
      deviceListMetadataVersion: 2,
    },
    interactiveMessage: interactiveMsg,
  };

  const waMsg = generateWAMessageFromContent(jid, msgContent, {
    userJid: conn.user?.id,
    timestamp: new Date(),
  });

  await conn.relayMessage(jid, waMsg.message, {
    messageId: waMsg.key.id,
    additionalNodes: [{ tag: 'biz', attrs: {}, content: undefined }],
  });
  return true;
}

/**
 * Send an interactive button message.
 * @param {object} conn       - Baileys connection
 * @param {string} jid        - Target JID (should be real phone JID, not @lid)
 * @param {object} options    - { title, body, footer, image, buttons: [{id, text}] }
 * @param {object} quotedMsg  - Optional quoted message (m object)
 */
export async function sendBtn(conn, jid, options = {}, quotedMsg) {
  const { image, body = '', footer = '', buttons = [], title = '' } = options;

  const realJid = resolveJid(jid);

  if (buttons.length > 0) {
    // ── Attempt 1: raw baileys WITHOUT viewOnce ───────────────────────────────
    try {
      await sendRawNaked(conn, realJid, { body, footer, image, buttons });
      console.log('[sendBtn] ✅ raw naked OK →', realJid);
      return true;
    } catch (err) {
      console.error('[sendBtn] raw naked failed:', err?.message, '— trying gifted-btns sendButtons');
    }

    // ── Attempt 2: sendButtons (gifted-btns, has viewOnce — works in non-self chats) ──
    try {
      const simpleButtons = buttons.map((b, i) => {
        if (b.id && b.text) return { id: b.id, text: b.text };
        if (b.name && b.buttonParamsJson !== undefined) return b;
        return { id: `btn_${i}`, text: String(b.text || b.displayText || `Option ${i + 1}`) };
      });

      await sendButtons(conn, realJid, {
        title,
        text: body,
        footer,
        ...(image ? { image: typeof image === 'string' ? { url: image } : image } : {}),
        buttons: simpleButtons,
      });
      console.log('[sendBtn] ✅ gifted-btns sendButtons OK →', realJid);
      return true;
    } catch (err) {
      console.error('[sendBtn] gifted-btns failed:', err?.message, '— falling back to text');
    }
  }

  // ── Fallback: image + numbered text options ───────────────────────────────
  const btnLines = buttons.length
    ? '\n\n' + buttons.map((b, i) => `*${i + 1}.* ${b.text || b.displayText || b.name || 'Option'}`).join('\n')
    : '';
  const fullText = `${body}${btnLines}${footer ? `\n\n_${footer}_` : ''}`;
  const imgUrl = image ? (typeof image === 'string' ? image : image?.url) : null;

  try {
    if (imgUrl) {
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
      messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
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
