/**
 * Interactive button sender — mirrors Atassa's exact call pattern.
 *
 * Atassa: sendButtons(Gifted, from, { title, text, footer, image, buttons: [{id, text}] })
 * We do exactly the same, passing m.realJid (real phone JID) as `from`.
 *
 * Fallback chain:
 * 1. sendButtons (high-level gifted-btns API — same as Atassa)
 * 2. sendInteractiveMessage (low-level gifted-btns API)
 * 3. Raw baileys generateWAMessageFromContent + relayMessage with additionalNodes
 * 4. Plain text with button labels
 */
import { createRequire } from 'module';
import { lidMap } from './Serializer.js';

const _require = createRequire(import.meta.url);
const { sendButtons, sendInteractiveMessage } = _require('gifted-btns');

import pkg from '@whiskeysockets/baileys';
const { generateWAMessageFromContent, generateWAMessageContent } = pkg;

// ─── Resolve @lid → real phone JID ────────────────────────────────────────────
function resolveJid(jid) {
  if (!jid) return jid;
  if (!jid.endsWith('@lid')) return jid;
  const real = lidMap.get(jid);
  return (real && !real.endsWith('@lid')) ? real : jid;
}

// ─── Raw baileys interactive message (last resort before plain text) ──────────
async function sendRawInteractive(conn, jid, { body, footer, image, buttons }) {
  const nativeFlowBtns = buttons.map((b) => ({
    name: b.name || 'quick_reply',
    buttonParamsJson: b.buttonParamsJson || JSON.stringify({
      display_text: b.text || b.displayText || 'Option',
      id: b.id || b.buttonId || 'btn',
    }),
  }));

  let headerContent = {};
  if (image) {
    try {
      const imgSrc = typeof image === 'string' ? { url: image } : image;
      const imgContent = await generateWAMessageContent(
        { image: imgSrc },
        { upload: conn.waUploadToServer },
      );
      if (imgContent?.imageMessage) {
        headerContent = { imageMessage: imgContent.imageMessage, hasMediaAttachment: true };
      }
    } catch (_) {}
  }

  const msgContent = {
    viewOnceMessage: {
      message: {
        messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
        interactiveMessage: {
          body: { text: body || '' },
          footer: { text: footer || '' },
          header: Object.keys(headerContent).length ? headerContent : undefined,
          nativeFlowMessage: { buttons: nativeFlowBtns },
        },
      },
    },
  };

  const msg = generateWAMessageFromContent(jid, msgContent, { userJid: conn.user?.id });
  await conn.relayMessage(jid, msg.message, {
    messageId: msg.key.id,
    additionalNodes: [{ tag: 'biz', attrs: {}, content: undefined }],
  });
  return true;
}

/**
 * Send an interactive button message.
 * Uses sendButtons (Atassa's exact API) first, then falls back gracefully.
 */
export async function sendBtn(conn, jid, options = {}, quotedMsg) {
  const { image, body = '', footer = '', buttons = [], mentions = [], title = '' } = options;

  // Resolve any residual @lid JID (m.realJid from serializer should already be resolved)
  const realJid = resolveJid(jid);

  if (buttons.length > 0) {
    // ── Attempt 1: sendButtons — the exact same call Atassa makes ─────────────
    // Atassa passes buttons as [{id, text}] — simple format, sendButtons handles conversion
    try {
      const simpleButtons = buttons.map((b, i) => {
        if (b.id && b.text) return { id: b.id, text: b.text };
        if (b.name && b.buttonParamsJson) return b;
        return { id: `btn_${i}`, text: String(b.text || b.displayText || `Option ${i + 1}`) };
      });

      await sendButtons(conn, realJid, {
        title,
        text: body,
        footer,
        ...(image ? { image: typeof image === 'string' ? { url: image } : image } : {}),
        buttons: simpleButtons,
      });
      console.log('[sendBtn] ✅ sendButtons OK →', realJid);
      return true;
    } catch (err) {
      console.error('[sendBtn] sendButtons failed:', err?.message, '— trying sendInteractiveMessage');
    }

    // ── Attempt 2: sendInteractiveMessage with native flow format ──────────────
    try {
      const nativeButtons = buttons.map((b, i) => {
        if (b.name && b.buttonParamsJson !== undefined) return b;
        return {
          name: 'quick_reply',
          buttonParamsJson: JSON.stringify({
            display_text: b.text || b.displayText || `Option ${i + 1}`,
            id: b.id || b.buttonId || `btn_${i}`,
          }),
        };
      });

      await sendInteractiveMessage(conn, realJid, {
        title,
        text: body,
        footer,
        ...(image ? { image: typeof image === 'string' ? { url: image } : image } : {}),
        interactiveButtons: nativeButtons,
      });
      console.log('[sendBtn] ✅ sendInteractiveMessage OK →', realJid);
      return true;
    } catch (err) {
      console.error('[sendBtn] sendInteractiveMessage failed:', err?.message, '— trying raw baileys');
    }

    // ── Attempt 3: raw baileys ────────────────────────────────────────────────
    try {
      await sendRawInteractive(conn, realJid, { body, footer, image, buttons });
      console.log('[sendBtn] ✅ raw baileys OK →', realJid);
      return true;
    } catch (err) {
      console.error('[sendBtn] raw baileys failed:', err?.message, '— falling back to text');
    }
  }

  // ── Fallback: plain text ────────────────────────────────────────────────────
  const btnLines = buttons.length
    ? '\n\n' + buttons.map((b) => `┣ ${b.text || b.displayText || b.name || 'Option'}`).join('\n')
    : '';
  const fullText = `${body}${btnLines}${footer ? `\n\n> ${footer}` : ''}`;
  const imgUrl = image ? (typeof image === 'string' ? image : image.url) : null;

  if (imgUrl) {
    try {
      await conn.sendMessage(realJid, { image: { url: imgUrl }, caption: fullText, mentions });
      return true;
    } catch (_) {}
  }

  try {
    await conn.sendMessage(realJid, { text: fullText, mentions });
    return true;
  } catch (err) {
    console.error('[sendBtn] ALL fallbacks failed:', err?.message);
  }

  return false;
}

/**
 * Send a list message.
 */
export async function sendList(conn, jid, options = {}) {
  const { title = '', body = '', footer = '', buttonText = '☰ Open Menu', sections = [] } = options;
  const realJid = resolveJid(jid);

  try {
    await sendInteractiveMessage(conn, realJid, {
      text: body,
      footer,
      title,
      interactiveButtons: [{
        name: 'single_select',
        buttonParamsJson: JSON.stringify({ title: buttonText, sections }),
      }],
    });
    return;
  } catch (_) {}

  const rows = sections.flatMap(s => s.rows || []);
  const text = `*${title}*\n\n${body}\n\n${rows.map((r, i) => `${i + 1}. ${r.title}`).join('\n')}${footer ? `\n\n> ${footer}` : ''}`;
  await conn.sendMessage(realJid, { text }).catch(() => {});
}
