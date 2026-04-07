import config from '../config.cjs';

const settings = async (m, conn, { isOwner }) => {
  if (!m.body) return;
  const body = m.body.trim();
  if (!body.startsWith(config.PREFIX)) return;
  const args = body.slice(config.PREFIX.length).trim().split(/\s+/);
  const cmd = args[0].toLowerCase();
  const q = args.slice(1).join(' ');

  // ─── MODE ───
  if (['setmode', 'mode', 'botmode'].includes(cmd)) {
    if (!isOwner) return m.reply('❌ Owner only command!');
    if (!q || !['public', 'private', 'inbox', 'group'].includes(q.toLowerCase())) {
      return m.reply(`❌ Usage: ${config.PREFIX}setmode <public|private|inbox|group>\n\n*Current mode:* ${config.MODE}`);
    }
    config.MODE = q.toLowerCase();
    await m.reply(`✅ Bot mode changed to: *${config.MODE}*\n\n📶 The bot will now respond in ${config.MODE} mode.`);
    await m.React('✅');
    return;
  }

  // ─── AUTO TYPING ───
  if (['setautotyping', 'autotyping', 'typing'].includes(cmd)) {
    if (!isOwner) return m.reply('❌ Owner only command!');
    if (!q || !['on', 'off', 'true', 'false'].includes(q.toLowerCase())) {
      return m.reply(`❌ Usage: ${config.PREFIX}setautotyping <on|off>\n\n*Current:* ${config.AUTO_TYPING ? 'ON' : 'OFF'}`);
    }
    config.AUTO_TYPING = ['on', 'true'].includes(q.toLowerCase());
    await m.reply(`✅ Auto typing ${config.AUTO_TYPING ? 'enabled' : 'disabled'}!`);
    await m.React('✅');
    return;
  }

  // ─── ANTI DELETE ───
  if (['setantidelete', 'antidelete', 'antidel'].includes(cmd)) {
    if (!isOwner) return m.reply('❌ Owner only command!');
    if (!q || !['on', 'off', 'true', 'false'].includes(q.toLowerCase())) {
      return m.reply(`❌ Usage: ${config.PREFIX}setantidelete <on|off>\n\n*Current:* ${config.ANTI_DELETE ? 'ON' : 'OFF'}`);
    }
    config.ANTI_DELETE = ['on', 'true'].includes(q.toLowerCase());
    await m.reply(`✅ Anti-delete ${config.ANTI_DELETE ? 'enabled' : 'disabled'}!`);
    await m.React('✅');
    return;
  }

  // ─── ANTI CALL ───
  if (['setrejectcall', 'rejectcall', 'anticall'].includes(cmd)) {
    if (!isOwner) return m.reply('❌ Owner only command!');
    if (!q || !['on', 'off', 'true', 'false'].includes(q.toLowerCase())) {
      return m.reply(`❌ Usage: ${config.PREFIX}setrejectcall <on|off>\n\n*Current:* ${config.REJECT_CALL ? 'ON' : 'OFF'}`);
    }
    config.REJECT_CALL = ['on', 'true'].includes(q.toLowerCase());
    await m.reply(`✅ Call rejection ${config.REJECT_CALL ? 'enabled' : 'disabled'}!`);
    await m.React('✅');
    return;
  }

  // ─── AUTO REACT ───
  if (['setautoreact', 'autoreact'].includes(cmd)) {
    if (!isOwner) return m.reply('❌ Owner only command!');
    if (!q || !['on', 'off'].includes(q.toLowerCase())) {
      return m.reply(`❌ Usage: ${config.PREFIX}setautoreact <on|off>\n\n*Current:* ${config.AUTO_REACT ? 'ON' : 'OFF'}`);
    }
    config.AUTO_REACT = q.toLowerCase() === 'on';
    await m.reply(`✅ Auto react ${config.AUTO_REACT ? 'enabled' : 'disabled'}!`);
    await m.React('✅');
    return;
  }

  // ─── SET PREFIX ───
  if (['setprefix', 'prefix', 'changeprefix'].includes(cmd)) {
    if (!isOwner) return m.reply('❌ Owner only command!');
    if (!q || q.length > 3) return m.reply(`❌ Usage: ${config.PREFIX}setprefix <new_prefix>\n\n*Current prefix:* \`${config.PREFIX}\``);
    const old = config.PREFIX;
    config.PREFIX = q.trim()[0];
    await m.reply(`✅ Prefix changed from \`${old}\` → \`${config.PREFIX}\`\n\nUse \`${config.PREFIX}menu\` for commands!`);
    await m.React('✅');
    return;
  }

  // ─── AUTO READ ───
  if (['setautoread', 'autoread', 'readall'].includes(cmd)) {
    if (!isOwner) return m.reply('❌ Owner only command!');
    if (!q || !['on', 'off'].includes(q.toLowerCase())) {
      return m.reply(`❌ Usage: ${config.PREFIX}setautoread <on|off>\n\n*Current:* ${config.AUTO_READ ? 'ON' : 'OFF'}`);
    }
    config.AUTO_READ = q.toLowerCase() === 'on';
    await m.reply(`✅ Auto read ${config.AUTO_READ ? 'enabled' : 'disabled'}!`);
    await m.React('✅');
    return;
  }

  // ─── ALWAYS ONLINE ───
  if (['setonline', 'alwaysonline', 'online'].includes(cmd)) {
    if (!isOwner) return m.reply('❌ Owner only command!');
    if (!q || !['on', 'off'].includes(q.toLowerCase())) {
      return m.reply(`❌ Usage: ${config.PREFIX}setonline <on|off>\n\n*Current:* ${config.ALWAYS_ONLINE ? 'ON' : 'OFF'}`);
    }
    config.ALWAYS_ONLINE = q.toLowerCase() === 'on';
    await m.reply(`✅ Always online ${config.ALWAYS_ONLINE ? 'enabled' : 'disabled'}!`);
    await m.React('✅');
    return;
  }

  // ─── AUTO STATUS SEEN ───
  if (['setstatusseen', 'statusseen', 'autostatusseen'].includes(cmd)) {
    if (!isOwner) return m.reply('❌ Owner only command!');
    if (!q || !['on', 'off'].includes(q.toLowerCase())) {
      return m.reply(`❌ Usage: ${config.PREFIX}setstatusseen <on|off>\n\n*Current:* ${config.AUTO_STATUS_SEEN ? 'ON' : 'OFF'}`);
    }
    config.AUTO_STATUS_SEEN = q.toLowerCase() === 'on';
    await m.reply(`✅ Auto status seen ${config.AUTO_STATUS_SEEN ? 'enabled' : 'disabled'}!`);
    await m.React('✅');
    return;
  }

  // ─── SHOW SETTINGS ───
  if (['getsettings', 'showsettings', 'settings', 'config'].includes(cmd)) {
    if (!isOwner) return m.reply('❌ Owner only command!');
    await m.reply(`⚙️ *${config.BOT_NAME} Settings*\n\n📶 *Mode:* ${config.MODE}\n🔧 *Prefix:* \`${config.PREFIX}\`\n💬 *Auto Typing:* ${config.AUTO_TYPING ? '✅' : '❌'}\n🗑️ *Anti Delete:* ${config.ANTI_DELETE ? '✅' : '❌'}\n📞 *Reject Calls:* ${config.REJECT_CALL ? '✅' : '❌'}\n😮 *Auto React:* ${config.AUTO_REACT ? '✅' : '❌'}\n📖 *Auto Read:* ${config.AUTO_READ ? '✅' : '❌'}\n📺 *Auto Status Seen:* ${config.AUTO_STATUS_SEEN ? '✅' : '❌'}\n❤️ *Auto Status React:* ${config.AUTO_STATUS_REACT ? '✅' : '❌'}\n🌐 *Always Online:* ${config.ALWAYS_ONLINE ? '✅' : '❌'}\n\n> ${config.BOT_NAME}`);
    await m.React('✅');
    return;
  }
};

export default settings;
