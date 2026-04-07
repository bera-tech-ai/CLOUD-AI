import config from '../config.cjs';

const anticall = async (m, conn) => {
  // anticall is handled in index.js via the call event
};

export const handleCall = async (conn, call) => {
  if (!config.REJECT_CALL) return;
  for (const c of call) {
    if (c.status === 'offer') {
      try {
        await conn.rejectCall(c.id, c.from);
        await conn.sendMessage(c.from, {
          text: `❌ *${config.BOT_NAME}* does not accept calls!\n\nPlease send a message instead. If you need help, type *${config.PREFIX}menu*\n\n> ${config.BOT_NAME}`,
        });
      } catch {}
    }
  }
};

export default anticall;
