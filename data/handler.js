import { serialize, decodeJid, lidMap } from '../lib/Serializer.js';
import config from '../config.cjs';

export async function Handler(conn, m, plugins) {
  try {
    const msg = await serialize(m, conn);
    if (!msg) return;

    // Skip empty messages (no body AND not media)
    const hasMedia = ['stickerMessage','imageMessage','videoMessage','audioMessage','documentMessage'].includes(msg.type);
    if (!msg.body && !hasMedia) return;

    // Resolve @lid sender → real phone JID (WhatsApp multi-device uses @lid in groups)
    // If the sender lid isn't in the map yet, fetch group participants to populate it
    if (msg.sender?.endsWith('@lid') && !lidMap.get(msg.sender) && msg.isGroup) {
      try {
        const meta = await conn.groupMetadata(msg.from);
        for (const p of meta.participants) {
          const lid = p.lid || p.lidJid;
          const id = p.id || p.jid;
          if (lid && id && !id.endsWith('@lid')) {
            lidMap.set(lid, id);
            lidMap.set(id, lid);
          }
        }
      } catch (_) {}
    }
    const resolvedSender = (msg.sender?.endsWith('@lid') && lidMap.get(msg.sender)) || msg.sender;

    // All known forms of the owner's JID — including any @lid entries that
    // have been resolved to their phone number via the lid map
    const ownerPhone = config.OWNER_NUMBER + '@s.whatsapp.net';
    const ownerLids  = [...lidMap.entries()]
      .filter(([, v]) => v === ownerPhone)
      .map(([k]) => k);

    const ownerJids = [
      ownerPhone,
      conn.user?.id,
      conn.user?.id?.split(':')[0] + '@s.whatsapp.net',
      ...ownerLids,   // every @lid that resolves to owner's phone number
    ].filter(Boolean);

    // Phone-number fallback: if we resolved the @lid to a @s.whatsapp.net JID,
    // compare the raw phone number part so a device-suffix like :22 doesn't block it
    const resolvedPhone = resolvedSender?.endsWith('@s.whatsapp.net')
      ? resolvedSender.split('@')[0].split(':')[0]
      : null;

    const isOwner = ownerJids.includes(msg.sender)
      || ownerJids.includes(resolvedSender)
      || (resolvedPhone && resolvedPhone === config.OWNER_NUMBER);

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
