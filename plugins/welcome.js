import config from '../config.cjs';

const welcome = async (m, conn) => {};

const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('Timed Out')), ms));

// Group participant update handler
export const onGroupUpdate = async (conn, update) => {
  try {
    const { id, participants, action } = update;
    if (!['add', 'remove'].includes(action)) return;

    let groupInfo;
    try {
      groupInfo = await Promise.race([conn.groupMetadata(id), timeout(8000)]);
    } catch {
      return;
    }
    const groupName = groupInfo?.subject || 'the group';

    for (const participant of participants) {
      const num = participant.split('@')[0];

      let pp = null;
      try {
        pp = await Promise.race([conn.profilePictureUrl(participant, 'image'), timeout(5000)]);
      } catch {}

      if (action === 'add') {
        const welcomeText = `╔════════════════════════╗\n║  *WELCOME TO THE GROUP!* 🎉  ║\n╚════════════════════════╝\n\n👋 Welcome, @${num}!\n\nYou have joined *${groupName}*. We're happy to have you here!\n\n📜 Please read the group rules and enjoy your stay!\n\n> ${config.BOT_NAME}`;
        if (pp) {
          await conn.sendMessage(id, { image: { url: pp }, caption: welcomeText, mentions: [participant] }).catch(() => {
            conn.sendMessage(id, { text: welcomeText, mentions: [participant] }).catch(() => {});
          });
        } else {
          await conn.sendMessage(id, { text: welcomeText, mentions: [participant] }).catch(() => {});
        }
      } else if (action === 'remove') {
        const byeText = `👋 *Goodbye @${num}!*\n\nWe'll miss you in *${groupName}*. Hope to see you again! 😢\n\n> ${config.BOT_NAME}`;
        if (pp) {
          await conn.sendMessage(id, { image: { url: pp }, caption: byeText, mentions: [participant] }).catch(() => {
            conn.sendMessage(id, { text: byeText, mentions: [participant] }).catch(() => {});
          });
        } else {
          await conn.sendMessage(id, { text: byeText, mentions: [participant] }).catch(() => {});
        }
      }
    }
  } catch (err) {
    if (err.message !== 'Timed Out') {
      console.error('[WELCOME] Error:', err.message);
    }
  }
};

export default welcome;
