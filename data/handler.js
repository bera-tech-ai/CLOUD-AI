import { serialize, decodeJid } from '../lib/Serializer.js';
import config from '../config.cjs';

export async function Handler(conn, m, plugins) {
  try {
    const msg = await serialize(m, conn);
    if (!msg) return;

    // Skip empty messages (no body AND not media)
    const hasMedia = ['stickerMessage','imageMessage','videoMessage','audioMessage','documentMessage'].includes(msg.type);
    if (!msg.body && !hasMedia) return;

    const isOwner = [
      config.OWNER_NUMBER + '@s.whatsapp.net',
      conn.user?.id,
      conn.user?.id?.split(':')[0] + '@s.whatsapp.net',
    ].includes(msg.sender);

    // Auto typing
    if (config.AUTO_TYPING) {
      conn.sendPresenceUpdate('composing', msg.from).catch(() => {});
    }

    // Mode check
    if (config.MODE === 'private' && !isOwner) return;

    // Debug: log incoming command attempts
    if (msg.body?.startsWith(config.PREFIX)) {
      const cmd = msg.body.slice(config.PREFIX.length).split(' ')[0].toLowerCase().trim();
      console.log(`[CMD] From: ${msg.sender} | Cmd: ${cmd} | Chat: ${msg.from}`);
    }

    // Run all plugins
    for (const plugin of plugins) {
      try {
        await plugin(msg, conn, { isOwner });
      } catch (err) {
        console.error(`[PLUGIN ERROR] ${err?.message || err}`);
        if (msg.body?.startsWith(config.PREFIX)) {
          msg.reply('❌ Command failed: ' + (err?.message || 'Unknown error')).catch(() => {});
        }
      }
    }
  } catch (err) {
    console.error('[HANDLER ERROR]', err?.message || err);
  }
}

export async function Callupdate(conn, call) {
  if (config.REJECT_CALL && call[0]?.status === 'offer') {
    await conn.rejectCall(call[0].id, call[0].from).catch(() => {});
    await conn.sendMessage(call[0].from, {
      text: `❌ *${config.BOT_NAME}* does not accept calls.\n\nPlease send a message instead.`,
    }).catch(() => {});
  }
}

export async function GroupUpdate(conn, update) {
  // Handled by welcome.js plugin
}
