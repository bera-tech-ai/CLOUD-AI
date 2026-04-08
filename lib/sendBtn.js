/**
 * Interactive button sender using gifted-btns sendInteractiveMessage.
 * Falls back to plain text if the interactive send fails.
 *
 * Root cause of previous failure: sendButtons() silently accepts {id,text}
 * buttons but getButtonArgs() returns empty {tag:'biz',attrs:{}} for every
 * format — the button content is never serialized. The correct API for
 * quick_reply buttons is sendInteractiveMessage() with
 * { name:'quick_reply', buttonParamsJson:'{"display_text":"...","id":"..."}' }
 */
import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const { sendInteractiveMessage } = _require('gifted-btns');

/**
 * Convert our internal {id, text} button format to native-flow quick_reply.
 * Also passes through buttons that are already in native-flow format.
 */
function toNativeFlow(buttons) {
  return buttons.map((b) => {
    // Already native flow — pass through as-is
    if (b.name && b.buttonParamsJson !== undefined) return b;
    // Convert simple {id, text} → quick_reply
    return {
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({
        display_text: b.text || b.displayText || b.label || 'Option',
        id: b.id || b.buttonId || 'btn',
      }),
    };
  });
}

/**
 * Send an interactive button message.
 * Falls back to formatted plain text when gifted-btns fails.
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

  const quoted = quotedMsg?.raw || undefined;

  if (buttons.length > 0) {
    try {
      await sendInteractiveMessage(conn, jid, {
        title,
        text: body,
        footer,
        ...(image
          ? { image: typeof image === 'string' ? { url: image } : image }
          : {}),
        interactiveButtons: toNativeFlow(buttons),
      });
      return true;
    } catch (err) {
      console.error('[sendBtn] gifted-btns error:', err?.message);
      // fall through to plain text fallback
    }
  }

  // ── Plain text fallback ──────────────────────────────────────────────────
  const btnLines = buttons.length
    ? '\n\n' + toNativeFlow(buttons)
        .map((b) => {
          try {
            const p = JSON.parse(b.buttonParamsJson || '{}');
            return `┣ ${p.display_text || b.name || 'Option'}`;
          } catch {
            return `┣ ${b.name || 'Option'}`;
          }
        })
        .join('\n')
    : '';

  const fullText = `${body}${btnLines}${footer ? `\n\n> ${footer}` : ''}`;

  if (image) {
    const imgUrl = typeof image === 'string' ? image : image.url;
    if (quoted) {
      try {
        await conn.sendMessage(jid, { image: { url: imgUrl }, caption: fullText, mentions }, { quoted });
        return true;
      } catch (_) {}
    }
    try {
      await conn.sendMessage(jid, { image: { url: imgUrl }, caption: fullText, mentions });
      return true;
    } catch (_) {}
  }

  if (quoted) {
    try {
      await conn.sendMessage(jid, { text: fullText, mentions }, { quoted });
      return true;
    } catch (_) {}
  }

  try {
    await conn.sendMessage(jid, { text: fullText, mentions });
    return true;
  } catch (err) {
    console.error('[sendBtn] Fallback failed:', err?.message);
  }

  return false;
}

/**
 * Send a list message (single_select button).
 */
export async function sendList(conn, jid, options = {}, quotedMsg) {
  const { title = '', body = '', footer = '', buttonText = '☰ Open Menu', sections = [] } = options;
  const quoted = quotedMsg?.raw || undefined;

  // Try gifted-btns single_select via sendInteractiveMessage
  try {
    await sendInteractiveMessage(conn, jid, {
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

  // Try native Baileys listMessage
  try {
    await conn.sendMessage(
      jid,
      { listMessage: { title, description: body, footerText: footer, buttonText, listType: 1, sections } },
      quoted ? { quoted } : {},
    );
    return;
  } catch (_) {}

  // Plain text fallback
  const rows = sections.flatMap(s => s.rows || []);
  const text = `*${title}*\n\n${body}\n\n${rows.map((r, i) => `${i + 1}. ${r.title}`).join('\n')}${footer ? `\n\n> ${footer}` : ''}`;
  await conn.sendMessage(jid, { text }).catch(() => {});
}
