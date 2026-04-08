/**
 * Interactive button sender.
 *
 * Flow:
 * 1. Resolve @lid JID → real phone JID (gifted-btns can't route @lid)
 * 2. Try sendInteractiveMessage from gifted-btns (quick_reply native flow)
 * 3. If that fails, try raw baileys generateWAMessageFromContent + relayMessage
 * 4. Final fallback: plain text with button list
 */
import { createRequire } from 'module';
import { lidMap } from './Serializer.js';

const _require = createRequire(import.meta.url);
const { sendInteractiveMessage } = _require('gifted-btns');

import pkg from '@whiskeysockets/baileys';
const { generateWAMessageFromContent, generateWAMessageContent, proto } = pkg;

// ─── Resolve @lid → real phone JID ────────────────────────────────────────────
function resolveJid(jid) {
  if (!jid) return jid;
  if (!jid.endsWith('@lid')) return jid;
  const real = lidMap.get(jid);
  return (real && !real.endsWith('@lid')) ? real : jid;
}

// ─── Convert simple {id, text} buttons → native-flow quick_reply ──────────────
function toNativeFlow(buttons) {
  return buttons.map((b) => {
    if (b.name && b.buttonParamsJson !== undefined) return b;
    return {
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({
        display_text: b.text || b.displayText || b.label || 'Option',
        id: b.id || b.buttonId || 'btn',
      }),
    };
  });
}

// ─── Build interactive message via raw Baileys ─────────────────────────────────
async function sendRawInteractive(conn, jid, { title, body, footer, image, buttons }) {
  const interactiveButtons = toNativeFlow(buttons);

  let headerContent = {};
  if (image) {
    try {
      const imgContent = await generateWAMessageContent(
        { image: typeof image === 'string' ? { url: image } : image },
        { upload: conn.waUploadToServer },
      );
      if (imgContent?.imageMessage) {
        headerContent = {
          imageMessage: imgContent.imageMessage,
          hasMediaAttachment: true,
        };
      }
    } catch (_) {}
  } else if (title) {
    headerContent = { title, hasMediaAttachment: false };
  }

  const msgContent = {
    viewOnceMessage: {
      message: {
        messageContextInfo: {
          deviceListMetadata: {},
          deviceListMetadataVersion: 2,
        },
        interactiveMessage: {
          body: { text: body || '' },
          footer: { text: footer || '' },
          header: Object.keys(headerContent).length ? headerContent : undefined,
          nativeFlowMessage: {
            buttons: interactiveButtons.map((b) => ({
              name: b.name,
              buttonParamsJson: b.buttonParamsJson,
            })),
          },
        },
      },
    },
  };

  const msg = generateWAMessageFromContent(jid, msgContent, {
    userJid: conn.user?.id,
  });

  await conn.relayMessage(jid, msg.message, {
    messageId: msg.key.id,
    additionalNodes: [{ tag: 'biz', attrs: {}, content: undefined }],
  });
  return true;
}

/**
 * Send an interactive button message.
 * Falls back to plain text when all interactive methods fail.
 */
export async function sendBtn(conn, jid, options = {}, quotedMsg) {
  const {
    image,
    body = '',
    footer = '',
    buttons = [],
    mentions = [],
    title = '',
  } = options;

  // Resolve @lid → real JID so gifted-btns and relayMessage can route it
  const realJid = resolveJid(jid);
  const quoted = quotedMsg?.raw || undefined;

  if (buttons.length > 0) {
    // ── Attempt 1: gifted-btns sendInteractiveMessage ──────────────────────
    try {
      await sendInteractiveMessage(conn, realJid, {
        title,
        text: body,
        footer,
        ...(image
          ? { image: typeof image === 'string' ? { url: image } : image }
          : {}),
        interactiveButtons: toNativeFlow(buttons),
      });
      console.log('[sendBtn] ✅ gifted-btns OK →', realJid);
      return true;
    } catch (err) {
      console.error('[sendBtn] gifted-btns failed:', err?.message, '— trying raw baileys');
    }

    // ── Attempt 2: raw baileys generateWAMessageFromContent + relayMessage ──
    try {
      await sendRawInteractive(conn, realJid, { title, body, footer, image, buttons });
      console.log('[sendBtn] ✅ raw baileys OK →', realJid);
      return true;
    } catch (err) {
      console.error('[sendBtn] raw baileys failed:', err?.message, '— falling back to text');
    }
  }

  // ── Fallback: plain text with button labels ──────────────────────────────
  const nf = buttons.length ? toNativeFlow(buttons) : [];
  const btnLines = nf.length
    ? '\n\n' + nf.map((b) => {
        try {
          const p = JSON.parse(b.buttonParamsJson || '{}');
          return `┣ ${p.display_text || b.name || 'Option'}`;
        } catch {
          return `┣ ${b.name || 'Option'}`;
        }
      }).join('\n')
    : '';

  const fullText = `${body}${btnLines}${footer ? `\n\n> ${footer}` : ''}`;

  const imgUrl = image ? (typeof image === 'string' ? image : image.url) : null;

  if (imgUrl) {
    try {
      await conn.sendMessage(realJid, { image: { url: imgUrl }, caption: fullText, mentions },
        quoted ? { quoted } : {});
      return true;
    } catch (_) {
      try {
        await conn.sendMessage(realJid, { image: { url: imgUrl }, caption: fullText, mentions });
        return true;
      } catch (_2) {}
    }
  }

  try {
    await conn.sendMessage(realJid, { text: fullText, mentions }, quoted ? { quoted } : {});
    return true;
  } catch (_) {
    try {
      await conn.sendMessage(realJid, { text: fullText, mentions });
      return true;
    } catch (err) {
      console.error('[sendBtn] All fallbacks failed:', err?.message);
    }
  }

  return false;
}

/**
 * Send a list message (single_select button).
 */
export async function sendList(conn, jid, options = {}, quotedMsg) {
  const { title = '', body = '', footer = '', buttonText = '☰ Open Menu', sections = [] } = options;
  const realJid = resolveJid(jid);
  const quoted = quotedMsg?.raw || undefined;

  try {
    await sendInteractiveMessage(conn, realJid, {
      text: body,
      footer,
      title,
      interactiveButtons: [
        {
          name: 'single_select',
          buttonParamsJson: JSON.stringify({ title: buttonText, sections }),
        },
      ],
    });
    return;
  } catch (_) {}

  try {
    await conn.sendMessage(
      realJid,
      { listMessage: { title, description: body, footerText: footer, buttonText, listType: 1, sections } },
      quoted ? { quoted } : {},
    );
    return;
  } catch (_) {}

  const rows = sections.flatMap(s => s.rows || []);
  const text = `*${title}*\n\n${body}\n\n${rows.map((r, i) => `${i + 1}. ${r.title}`).join('\n')}${footer ? `\n\n> ${footer}` : ''}`;
  await conn.sendMessage(realJid, { text }).catch(() => {});
}
