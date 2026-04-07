const emojis = ['❤️', '🔥', '😍', '💯', '✨', '😎', '🎉', '💪', '👏', '🥳', '😂', '🙌'];

function doReact(conn, msg) {
  const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
  conn.sendMessage(msg.key.remoteJid, { react: { text: randomEmoji, key: msg.key } });
}

module.exports = { emojis, doReact };
