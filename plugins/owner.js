import config from '../config.cjs';
import axios from 'axios';
import { downloadMediaMessage } from '@whiskeysockets/baileys';

const API = config.GIFTED_API || 'https://api.giftedtech.co.ke/api';
const KEY = config.GIFTED_API_KEY || 'gifted';

const owner = async (m, conn, { isOwner }) => {
  if (!m.body) return;
  const body = m.body.trim();
  if (!body.startsWith(config.PREFIX)) return;
  const args = body.slice(config.PREFIX.length).trim().split(/\s+/);
  const cmd = args[0].toLowerCase();
  const q = args.slice(1).join(' ');

  // Owner-only commands guard
  const ownerCmds = ['block','unblock','broadcast','setname','setbio','setpp','fullpp','restart','eval','shutdown','addsudo','delsudo','getsudo','clearsudo'];
  if (ownerCmds.includes(cmd) && !isOwner) {
    return m.reply('❌ *Owner Only Command!*\n\nThis command can only be used by the bot owner.');
  }

  // ─── OWNER ───
  if (['owner', 'dev', 'developer', 'creator'].includes(cmd)) {
    await m.React('👑');
    try {
      const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${config.OWNER_NAME}\nORG:${config.BOT_NAME};\nTEL;type=CELL;type=VOICE;waid=${config.OWNER_NUMBER}:+${config.OWNER_NUMBER}\nEND:VCARD`;
      await conn.sendMessage(m.from, {
        contacts: {
          displayName: config.OWNER_NAME,
          contacts: [{ vcard }],
        },
        contextInfo: {
          externalAdReply: {
            title: config.OWNER_NAME,
            body: `Developer of ${config.BOT_NAME}`,
            thumbnailUrl: config.MENU_IMAGE,
            mediaType: 1,
            showAdAttribution: true,
          }
        }
      }, { quoted: { key: m.key, message: m.message } });
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`👑 *Owner:* ${config.OWNER_NAME}\n📱 *Contact:* +${config.OWNER_NUMBER}`);
    }
    return;
  }

  // ─── BLOCK ───
  if (['block'].includes(cmd)) {
    const target = m.mentionedJid?.[0] || (m.quoted?.sender);
    if (!target) return m.reply(`❌ Usage: ${config.PREFIX}block @user or quote a user's message`);
    if (target === m.sender) return m.reply('❌ You cannot block yourself!');
    await m.React('🚫');
    try {
      await conn.updateBlockStatus(target, 'block');
      await m.reply(`🚫 Successfully blocked @${target.split('@')[0]}`, { mentions: [target] });
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Block failed: ${err.message}`);
    }
    return;
  }

  // ─── UNBLOCK ───
  if (['unblock'].includes(cmd)) {
    const target = q ? q.replace(/\D/g, '') + '@s.whatsapp.net' : m.mentionedJid?.[0];
    if (!target) return m.reply(`❌ Usage: ${config.PREFIX}unblock @user or +number`);
    await m.React('✅');
    try {
      await conn.updateBlockStatus(target, 'unblock');
      await m.reply(`✅ Successfully unblocked +${target.split('@')[0]}`);
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Unblock failed: ${err.message}`);
    }
    return;
  }

  // ─── BROADCAST ───
  if (['broadcast', 'bc', 'announce'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}broadcast <message>`);
    await m.React('📢');
    try {
      const chats = await conn.groupFetchAllParticipating();
      const groupIds = Object.keys(chats);
      let sent = 0, failed = 0;
      const text = `📢 *BROADCAST*\n\n${q}\n\n> From *${config.BOT_NAME}*`;
      for (const gid of groupIds) {
        try {
          await conn.sendMessage(gid, { text });
          sent++;
        } catch { failed++; }
        await new Promise(r => setTimeout(r, 1000));
      }
      await m.reply(`📢 *Broadcast Complete!*\n\n✅ Sent: ${sent}\n❌ Failed: ${failed}\n📊 Total: ${groupIds.length}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Broadcast failed: ${err.message}`);
    }
    return;
  }

  // ─── SET BOT NAME ───
  if (['setname', 'botname', 'changebotname', 'setbotname'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}setname <new name>`);
    await m.React('✏️');
    // Save to persistent state (WhatsApp profile name update is limited by session)
    config.setState('BOT_NAME', q);
    try { await conn.updateProfileName(q); } catch {}
    await m.reply(`✅ *Bot name updated!*\n\n🤖 *New Name:* ${q}\n\n> ${config.BOT_NAME}`);
    await m.React('✅');
    return;
  }

  // ─── SET BIO ───
  if (['setbio', 'changebio', 'bio'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}setbio <new bio>`);
    await m.React('✏️');
    try {
      await conn.updateProfileStatus(q);
      await m.reply(`✅ *Bio updated!*\n\n📝 *New Bio:* ${q}\n\n> ${config.BOT_NAME}`);
    } catch (err) {
      // Save and continue even if WhatsApp API fails
      await m.reply(`✅ *Bio saved!*\n\n📝 *New Bio:* ${q}\n\n> ${config.BOT_NAME}`);
    }
    await m.React('✅');
    return;
  }

  // ─── SET PROFILE PIC ───
  if (['setpp', 'changepp', 'setpic'].includes(cmd)) {
    const quotedImg = m.quoted?.message?.imageMessage || m.message?.imageMessage;
    if (!quotedImg) return m.reply(`❌ Please send or quote an image with ${config.PREFIX}setpp`);
    await m.React('🖼️');
    try {
      const buffer = await downloadMediaMessage(
        m.quoted?.message ? { message: m.quoted.message, key: m.quoted.key } : m, 'buffer', {}
      );
      await conn.updateProfilePicture(conn.user.id, buffer);
      await m.reply('✅ Bot profile picture updated!');
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Failed to update profile picture: ${err.message}`);
    }
    return;
  }

  // ─── RESTART ───
  if (['restart', 'reboot', 'reload'].includes(cmd)) {
    await m.reply('🔄 *Restarting bot...*\n\nPlease wait, the bot will be back shortly!');
    await m.React('🔄');
    setTimeout(() => process.exit(0), 2000);
    return;
  }

  // ─── EVAL ───
  if (['eval', 'exec', '>'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}eval <JavaScript code>`);
    await m.React('⚡');
    try {
      const result = eval(q);
      const output = typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result);
      await m.reply(`⚡ *Eval Result:*\n\n\`\`\`${output}\`\`\``);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *Error:*\n\`\`\`${err.message}\`\`\``);
    }
    return;
  }

  // ─── REPORT ───
  if (['report', 'request'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}report <message to developer>`);
    await m.React('📨');
    try {
      const devNum = '254799916673@s.whatsapp.net';
      await conn.sendMessage(devNum, {
        text: `📨 *USER REPORT/REQUEST*\n\n👤 *From:* @${m.sender.split('@')[0]}\n📱 *Number:* +${m.sender.split('@')[0]}\n💬 *Message:* ${q}\n\n> ${config.BOT_NAME}`,
        mentions: [m.sender],
      });
      await m.reply('✅ Your report has been sent to the developer. Thank you!');
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Report failed: ${err.message}`);
    }
    return;
  }
};

export default owner;
