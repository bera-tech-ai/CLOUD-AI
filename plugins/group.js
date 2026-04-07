import config from '../config.cjs';

const group = async (m, conn) => {
  if (!m.body) return;
  const body = m.body.trim();
  if (!body.startsWith(config.PREFIX)) return;
  const args = body.slice(config.PREFIX.length).trim().split(/\s+/);
  const cmd = args[0].toLowerCase();
  const q = args.slice(1).join(' ');

  if (!m.isGroup) {
    if (['kick','add','promote','demote','mute','unmute','tagall','hidetag','everyone','tag','gclink','revoke','setgcname','setgcdesc','setgcpp','gcinfo','gcpp'].includes(cmd)) {
      return m.reply('❌ This command only works in groups!');
    }
    return;
  }

  // Get group metadata
  let groupInfo, participants = [], groupAdmins = [], isBotAdmin = false, isAdmin = false;
  try {
    groupInfo = await conn.groupMetadata(m.from);
    participants = groupInfo.participants || [];
    groupAdmins = participants.filter(p => p.admin).map(p => p.id);
    isBotAdmin = groupAdmins.includes(conn.user?.id?.split(':')[0] + '@s.whatsapp.net') ||
                 groupAdmins.includes(conn.user?.id);
    isAdmin = groupAdmins.includes(m.sender) || m.sender === config.OWNER_NUMBER + '@s.whatsapp.net';
  } catch {}

  const botId = conn.user?.id?.split(':')[0] + '@s.whatsapp.net';

  // ─── KICK ───
  if (['kick', 'remove', 'ban'].includes(cmd)) {
    if (!isAdmin) return m.reply('❌ Admin only command!');
    if (!isBotAdmin) return m.reply('❌ I need to be an admin to kick members!');
    const target = m.mentionedJid?.[0] || (m.quoted?.sender);
    if (!target) return m.reply(`❌ Usage: ${config.PREFIX}kick @user\n\nMention or quote a user to kick.`);
    if (target === botId) return m.reply('❌ I cannot kick myself!');
    if (groupAdmins.includes(target)) return m.reply('❌ Cannot kick an admin!');
    await m.React('🦶');
    try {
      await conn.groupParticipantsUpdate(m.from, [target], 'remove');
      await m.reply(`✅ @${target.split('@')[0]} has been kicked from the group!`, { mentions: [target] });
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Kick failed: ${err.message}`);
    }
    return;
  }

  // ─── ADD ───
  if (['add', 'adduser'].includes(cmd)) {
    if (!isAdmin) return m.reply('❌ Admin only command!');
    if (!isBotAdmin) return m.reply('❌ I need to be an admin to add members!');
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}add <number with country code>\n*Example:* ${config.PREFIX}add 254712345678`);
    const num = q.replace(/\D/g, '') + '@s.whatsapp.net';
    await m.React('➕');
    try {
      await conn.groupParticipantsUpdate(m.from, [num], 'add');
      await m.reply(`✅ +${q.replace(/\D/g, '')} has been added to the group!`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Add failed: ${err.message}`);
    }
    return;
  }

  // ─── PROMOTE ───
  if (['promote', 'makeadmin', 'admin'].includes(cmd)) {
    if (!isAdmin) return m.reply('❌ Admin only command!');
    if (!isBotAdmin) return m.reply('❌ I need to be an admin to promote members!');
    const target = m.mentionedJid?.[0] || m.quoted?.sender;
    if (!target) return m.reply(`❌ Usage: ${config.PREFIX}promote @user`);
    await m.React('⬆️');
    try {
      await conn.groupParticipantsUpdate(m.from, [target], 'promote');
      await m.reply(`✅ @${target.split('@')[0]} is now a group admin!`, { mentions: [target] });
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Promote failed: ${err.message}`);
    }
    return;
  }

  // ─── DEMOTE ───
  if (['demote', 'removeadmin', 'unadmin'].includes(cmd)) {
    if (!isAdmin) return m.reply('❌ Admin only command!');
    if (!isBotAdmin) return m.reply('❌ I need to be an admin to demote admins!');
    const target = m.mentionedJid?.[0] || m.quoted?.sender;
    if (!target) return m.reply(`❌ Usage: ${config.PREFIX}demote @user`);
    if (target === botId) return m.reply('❌ I cannot demote myself!');
    await m.React('⬇️');
    try {
      await conn.groupParticipantsUpdate(m.from, [target], 'demote');
      await m.reply(`✅ @${target.split('@')[0]} has been demoted from admin!`, { mentions: [target] });
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Demote failed: ${err.message}`);
    }
    return;
  }

  // ─── MUTE ───
  if (['mute', 'lock', 'close', 'groupmute'].includes(cmd)) {
    if (!isAdmin) return m.reply('❌ Admin only command!');
    if (!isBotAdmin) return m.reply('❌ I need to be an admin to mute the group!');
    await m.React('🔇');
    try {
      await conn.groupSettingUpdate(m.from, 'announcement');
      await m.reply('🔇 Group has been muted! Only admins can send messages.');
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Mute failed: ${err.message}`);
    }
    return;
  }

  // ─── UNMUTE ───
  if (['unmute', 'open', 'unlock', 'groupopen'].includes(cmd)) {
    if (!isAdmin) return m.reply('❌ Admin only command!');
    if (!isBotAdmin) return m.reply('❌ I need to be an admin to unmute the group!');
    await m.React('🔊');
    try {
      await conn.groupSettingUpdate(m.from, 'not_announcement');
      await m.reply('🔊 Group has been unmuted! All members can now send messages.');
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Unmute failed: ${err.message}`);
    }
    return;
  }

  // ─── TAG ALL ───
  if (['tagall', 'mentionall', 'everyone', 'all'].includes(cmd)) {
    if (!isAdmin) return m.reply('❌ Admin only command!');
    await m.React('📢');
    try {
      const mentions = participants.map(p => p.id);
      const text = q || `📢 *Attention Everyone!*\n${mentions.map(p => `@${p.split('@')[0]}`).join(' ')}`;
      await conn.sendMessage(m.from, { text, mentions }, { quoted: { key: m.key, message: m.message } });
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Tag all failed: ${err.message}`);
    }
    return;
  }

  // ─── HIDETAG (ghost mention — tags all but hides mentions) ───
  if (['hidetag', 'htag', 'ghosttag', 'htagall'].includes(cmd)) {
    if (!isAdmin) return m.reply('❌ Admin only command!');
    await m.React('👻');
    try {
      const mentions = participants.map(p => p.id);
      const text = q || '👻 *Ghost Tag — You have been notified!*';
      // Send with mentions array but without @mentions in text = hidden/ghost tag
      await conn.sendMessage(m.from, { text, mentions }, { quoted: { key: m.key, message: m.message } });
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Hidetag failed: ${err.message}`);
    }
    return;
  }

  // ─── TAG ───
  if (['tag'].includes(cmd)) {
    const mentions = m.mentionedJid || [];
    if (!mentions.length) return m.reply(`❌ Usage: ${config.PREFIX}tag @user1 @user2 <message>`);
    const text = q.replace(/@\d+/g, '').trim() || '👋 You have been tagged!';
    await conn.sendMessage(m.from, {
      text: `${text}\n\n${mentions.map(p => `@${p.split('@')[0]}`).join(' ')}`,
      mentions
    }, { quoted: { key: m.key, message: m.message } });
    return;
  }

  // ─── GCLINK ───
  if (['gclink', 'grouplink', 'invitelink', 'link'].includes(cmd)) {
    if (!isBotAdmin) return m.reply('❌ I need to be an admin to get the group link!');
    await m.React('🔗');
    try {
      const code = await conn.groupInviteCode(m.from);
      await m.reply(`🔗 *Group Invite Link*\n\nhttps://chat.whatsapp.com/${code}\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Failed to get group link: ${err.message}`);
    }
    return;
  }

  // ─── REVOKE ───
  if (['revoke', 'resetlink', 'newlink'].includes(cmd)) {
    if (!isAdmin) return m.reply('❌ Admin only command!');
    if (!isBotAdmin) return m.reply('❌ I need to be an admin to revoke the invite link!');
    await m.React('🔄');
    try {
      await conn.groupRevokeInvite(m.from);
      const newCode = await conn.groupInviteCode(m.from);
      await m.reply(`✅ *Group invite link revoked!*\n\n🔗 New link:\nhttps://chat.whatsapp.com/${newCode}\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Revoke failed: ${err.message}`);
    }
    return;
  }

  // ─── SET GROUP NAME ───
  if (['setgcname', 'groupname', 'gcname', 'setgroupname'].includes(cmd)) {
    if (!isAdmin) return m.reply('❌ Admin only command!');
    if (!isBotAdmin) return m.reply('❌ I need to be an admin to change group name!');
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}setgcname <new name>`);
    await m.React('✏️');
    try {
      await conn.groupUpdateSubject(m.from, q);
      await m.reply(`✅ Group name updated to: *${q}*`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Failed to update group name: ${err.message}`);
    }
    return;
  }

  // ─── SET GROUP DESCRIPTION ───
  if (['setgcdesc', 'groupdesc', 'gcdesc', 'setgroupdesc'].includes(cmd)) {
    if (!isAdmin) return m.reply('❌ Admin only command!');
    if (!isBotAdmin) return m.reply('❌ I need to be an admin to change group description!');
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}setgcdesc <new description>`);
    await m.React('✏️');
    try {
      await conn.groupUpdateDescription(m.from, q);
      await m.reply(`✅ Group description updated!`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Failed to update description: ${err.message}`);
    }
    return;
  }

  // ─── GROUP INFO ───
  if (['gcinfo', 'groupinfo', 'ginfo'].includes(cmd)) {
    await m.React('ℹ️');
    try {
      const admins = participants.filter(p => p.admin).map(p => `+${p.id.split('@')[0]}`).join('\n  ');
      const created = groupInfo?.creation ? new Date(groupInfo.creation * 1000).toLocaleDateString() : 'Unknown';
      await m.reply(`ℹ️ *Group Info*\n\n📛 *Name:* ${groupInfo?.subject || 'Unknown'}\n👤 *Members:* ${participants.length}\n🔗 *Description:* ${groupInfo?.desc || 'None'}\n📅 *Created:* ${created}\n\n👑 *Admins:*\n  ${admins || 'None'}\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Failed to get group info: ${err.message}`);
    }
    return;
  }
};

export default group;
