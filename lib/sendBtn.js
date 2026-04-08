/**
 * Interactive button sender using gifted-btns.
 * Falls back to plain text if the interactive send fails.
 */
import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const { sendButtons: _giftedSend } = _require('gifted-btns');

/**
 * Convert our internal button format to gifted-btns format.
 * Accepts:
 *   - plain string:            "Label"
 *   - legacy quick reply:      { text, id? }  /  { displayText, id? }
 *   - native flow (pass-thru): { name, buttonParamsJson }
 */
function toGiftedButtons(buttons) {
  return buttons.map((b, i) => {
    if (typeof b === 'string') {
      return { id: `btn_${i}`, text: b };
    }
    if (b.name && b.buttonParamsJson !== undefined) {
      return b;
    }
    return {
      id: b.id || b.buttonId || `btn_${i}`,
      text: b.text || b.displayText || b.label || `Option ${i + 1}`,
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
      await _giftedSend(conn, jid, {
        title,
        text: body,
        footer,
        ...(image
          ? { image: typeof image === 'string' ? { url: image } : image }
          : {}),
        buttons: toGiftedButtons(buttons),
      });
      return true;
    } catch (err) {
      // gifted-btns failed — fall through to plain text
    }
  }

  // ── Plain text fallback ──
  const btnLines = buttons.length
    ? '\n\n' + toGiftedButtons(buttons)
        .map(b => `┣ ${b.text || b.displayText || ''}`)
        .join('\n')
    : '';

  const fullText = `${body}${btnLines}${footer ? `\n\n> ${footer}` : ''}`;

  if (image) {
    try {
      await conn.sendMessage(
        jid,
        { image: { url: typeof image === 'string' ? image : image.url }, caption: fullText, mentions },
        quoted ? { quoted } : {},
      );
      return true;
    } catch (_) {}
    try {
      await conn.sendMessage(jid, {
        image: { url: typeof image === 'string' ? image : image.url },
        caption: fullText,
        mentions,
      });
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
    console.error('[sendBtn] Failed:', err?.message);
  }

  return false;
}

/**
 * Send a list message (single_select button or native listMessage).
 */
export async function sendList(conn, jid, options = {}, quotedMsg) {
  const { title = '', body = '', footer = '', buttonText = '☰ Open Menu', sections = [] } = options;
  const quoted = quotedMsg?.raw || undefined;

  // Try gifted-btns single_select
  try {
    const { sendInteractiveMessage } = _require('gifted-btns');
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
