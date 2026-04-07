import { resolveLid } from './Serializer.js';

/**
 * Reliable message sender with @lid-safe quoted handling.
 * Skips the quoted option when the sender has an unresolved @lid JID,
 * which causes Baileys to time out in @fizzxydev/baileys-pro.
 */
export async function sendBtn(conn, jid, options = {}, quotedMsg) {
  // Resolve @lid for the target JID
  jid = resolveLid(jid);
  if (jid?.endsWith('@lid')) {
    console.error('[sendBtn] Cannot resolve @lid:', jid);
    return false;
  }

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

  // Use m.raw (safe, @lid-resolved) if available; skip quoted entirely if @lid
  // quotedMsg is the serialized `m` object from the handler
  const safeRaw = quotedMsg?.raw; // null when sender/@lid can't be resolved
  const quoted = safeRaw || undefined;

  // ── Try 1: Image + caption (if image provided) ──
  if (image) {
    try {
      await conn.sendMessage(jid, { image: { url: image }, caption: fullText, mentions },
        quoted ? { quoted } : {});
      return true;
    } catch (_) {}
    // Retry without quoted
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

  // ── Try 3: Plain text (guaranteed fallback) ──
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
  if (jid?.endsWith('@lid')) return;

  const { title = '', body = '', footer = '', buttonText = '☰ Open Menu', sections = [] } = options;
  const safeRaw = quotedMsg?.raw;
  const quoted = safeRaw || undefined;

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
