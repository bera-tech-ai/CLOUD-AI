import { resolveLid } from './Serializer.js';

/**
 * Reliable message sender — skips relayMessage entirely.
 * Uses conn.sendMessage directly which works for all JID types including @lid.
 */
export async function sendBtn(conn, jid, options = {}, quotedMsg) {
  jid = resolveLid(jid);

  const {
    image,
    body = '',
    footer = '',
    buttons = [],
    mentions = [],
  } = options;

  // Format buttons as readable text
  const btnLines = buttons.length
    ? '\n\n' + buttons.map(b => {
        const text = typeof b === 'string' ? b : b.text || b.displayText || '';
        return `┣ ${text}`;
      }).join('\n')
    : '';

  const fullText = `${body}${btnLines}${footer ? `\n\n> ${footer}` : ''}`;

  // Use raw quoted if available
  const quoted = quotedMsg?.raw || (quotedMsg ? { key: quotedMsg.key, message: quotedMsg.message } : undefined);

  // ── Try 1: Image + caption (if image provided) ──
  if (image) {
    try {
      await conn.sendMessage(jid, { image: { url: image }, caption: fullText, mentions }, quoted ? { quoted } : {});
      return true;
    } catch (_) {}
    // Try image without quoted
    try {
      await conn.sendMessage(jid, { image: { url: image }, caption: fullText, mentions });
      return true;
    } catch (_) {}
  }

  // ── Try 2: Text with quoted ──
  if (quoted) {
    try {
      await conn.sendMessage(jid, { text: fullText, mentions }, { quoted });
      return true;
    } catch (_) {}
  }

  // ── Try 3: Plain text (guaranteed) ──
  try {
    await conn.sendMessage(jid, { text: fullText, mentions });
    return true;
  } catch (err) {
    console.error('[sendBtn] Failed:', err?.message);
  }

  return false;
}

/**
 * Send a list message with guaranteed fallback.
 */
export async function sendList(conn, jid, options = {}, quotedMsg) {
  jid = resolveLid(jid);

  const { title = '', body = '', footer = '', buttonText = '☰ Open Menu', sections = [] } = options;
  const quoted = quotedMsg?.raw || (quotedMsg ? { key: quotedMsg.key, message: quotedMsg.message } : undefined);

  try {
    await conn.sendMessage(jid, {
      listMessage: { title, description: body, footerText: footer, buttonText, listType: 1, sections },
    }, quoted ? { quoted } : {});
    return;
  } catch (_) {}

  // Fallback: plain text
  const rows = sections.flatMap(s => s.rows || []);
  const text = `*${title}*\n\n${body}\n\n${rows.map((r, i) => `${i + 1}. ${r.title}`).join('\n')}${footer ? `\n\n> ${footer}` : ''}`;
  await conn.sendMessage(jid, { text }).catch(() => {});
}
