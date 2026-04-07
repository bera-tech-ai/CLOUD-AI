/**
 * Reliable message sender.
 * - Works with both @lid and @s.whatsapp.net JIDs (baileys-pro handles @lid natively)
 * - Skips "quoted" when m.raw is null (unresolved @lid group participant — causes timeouts)
 * - Falls back to plain text if image/quoted send fails
 */
export async function sendBtn(conn, jid, options = {}, quotedMsg) {
  const {
    image,
    body = '',
    footer = '',
    buttons = [],
    mentions = [],
  } = options;

  // Format buttons as readable text lines
  const btnLines = buttons.length
    ? '\n\n' + buttons.map(b => {
        const text = typeof b === 'string' ? b : b.text || b.displayText || '';
        return `┣ ${text}`;
      }).join('\n')
    : '';

  const fullText = `${body}${btnLines}${footer ? `\n\n> ${footer}` : ''}`;

  // m.raw is null when the original sender was an unresolved @lid (group privacy).
  // In that case skip quoted to avoid Baileys timing out on @lid lookups.
  const quoted = quotedMsg?.raw || undefined;

  // ── Try 1: Image + caption ──
  if (image) {
    try {
      await conn.sendMessage(jid, { image: { url: image }, caption: fullText, mentions },
        quoted ? { quoted } : {});
      return true;
    } catch (_) {}
    // Retry image without quoted
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
 * Send a list message with fallback to plain text.
 */
export async function sendList(conn, jid, options = {}, quotedMsg) {
  const { title = '', body = '', footer = '', buttonText = '☰ Open Menu', sections = [] } = options;
  const quoted = quotedMsg?.raw || undefined;

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
