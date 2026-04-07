import config from '../config.cjs';
import axios from 'axios';

const API = config.GIFTED_API || 'https://api.giftedtech.co.ke/api';
const KEY = config.GIFTED_API_KEY || 'gifted';

async function gApi(path, params = {}) {
  const res = await axios.get(`${API}/${path}`, { params: { apikey: KEY, ...params }, timeout: 15000 });
  return res.data;
}

const games = async (m, conn) => {
  if (!m.body) return;
  const body = m.body.trim();
  if (!body.startsWith(config.PREFIX)) return;
  const args = body.slice(config.PREFIX.length).trim().split(/\s+/);
  const cmd = args[0].toLowerCase();
  const q = args.slice(1).join(' ');

  // ─── JOKE ───
  if (['joke', 'jokes', 'funny'].includes(cmd)) {
    await m.React('😂');
    try {
      const res = await axios.get('https://v2.jokeapi.dev/joke/Any?blacklistFlags=nsfw,racist,sexist&type=single', { timeout: 10000 });
      const joke = res.data?.joke || 'Why do programmers prefer dark mode? Because light attracts bugs! 🐛';
      await m.reply(`😂 *Joke of the Moment*\n\n${joke}\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch {
      const jokes = [
        'Why do programmers prefer dark mode? Because light attracts bugs! 🐛',
        'I told my computer I needed a break. Now it won\'t stop sending me Kit-Kat ads.',
        'Why do Java developers wear glasses? Because they don\'t C#!',
        'A SQL query walks into a bar, walks up to two tables and asks... "Can I join you?"',
        'How many programmers does it take to change a light bulb? None — it\'s a hardware problem.',
      ];
      await m.reply(`😂 *Joke*\n\n${jokes[Math.floor(Math.random() * jokes.length)]}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── RIDDLE ───
  if (['riddle', 'riddleme', 'puzzle'].includes(cmd)) {
    await m.React('🧩');
    try {
      const res = await axios.get('https://riddles-api.vercel.app/random', { timeout: 10000 });
      const r = res.data;
      await m.reply(`🧩 *Riddle*\n\n❓ ${r.riddle}\n\n||✅ Answer: ${r.answer}||\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch {
      const riddles = [
        { q: 'The more you take, the more you leave behind. What am I?', a: 'Footsteps' },
        { q: 'I speak without a mouth and hear without ears. I have no body, but I come alive with the wind. What am I?', a: 'An echo' },
        { q: 'What has keys but no locks, space but no room, and you can enter but can\'t go inside?', a: 'A keyboard' },
        { q: 'What can travel around the world while staying in a corner?', a: 'A stamp' },
        { q: 'I have branches, but no fruit, trunk or leaves. What am I?', a: 'A bank' },
      ];
      const r = riddles[Math.floor(Math.random() * riddles.length)];
      await m.reply(`🧩 *Riddle*\n\n❓ ${r.q}\n\n||✅ Answer: ${r.a}||\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── TRIVIA ───
  if (['trivia', 'quiz', 'question'].includes(cmd)) {
    await m.React('🎯');
    try {
      const res = await axios.get('https://opentdb.com/api.php?amount=1&type=multiple', { timeout: 10000 });
      const q = res.data?.results?.[0];
      if (!q) throw new Error('No trivia');
      const all = [q.correct_answer, ...q.incorrect_answers].sort(() => Math.random() - 0.5);
      const labels = ['A', 'B', 'C', 'D'];
      const options = all.map((a, i) => `*${labels[i]}.* ${a}`).join('\n');
      const correctLabel = labels[all.indexOf(q.correct_answer)];
      await m.reply(`🎯 *Trivia*\n\n📚 *Category:* ${q.category}\n⭐ *Difficulty:* ${q.difficulty}\n\n❓ ${q.question.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'")}\n\n${options}\n\n||✅ Answer: ${correctLabel}. ${q.correct_answer}||\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Trivia failed: ${err.message}`);
    }
    return;
  }

  // ─── RPS (Rock Paper Scissors) ───
  if (['rps', 'rockpaperscissors'].includes(cmd)) {
    const choices = ['rock', 'paper', 'scissors'];
    const userChoice = q.toLowerCase().trim();
    if (!choices.includes(userChoice)) {
      return m.reply(`❌ Usage: ${config.PREFIX}rps <rock/paper/scissors>`);
    }
    await m.React('✊');
    const botChoice = choices[Math.floor(Math.random() * 3)];
    const emojis = { rock: '✊', paper: '✋', scissors: '✌️' };
    let result;
    if (userChoice === botChoice) result = '🤝 *It\'s a Tie!*';
    else if (
      (userChoice === 'rock' && botChoice === 'scissors') ||
      (userChoice === 'paper' && botChoice === 'rock') ||
      (userChoice === 'scissors' && botChoice === 'paper')
    ) result = '🎉 *You Win!*';
    else result = '😈 *Bot Wins!*';
    await m.reply(`✊ *Rock Paper Scissors*\n\n${emojis[userChoice]} *You:* ${userChoice}\n${emojis[botChoice]} *Bot:* ${botChoice}\n\n${result}\n\n> ${config.BOT_NAME}`);
    return;
  }

  // ─── FACT ───
  if (['fact', 'facts', 'funfact'].includes(cmd)) {
    await m.React('🤓');
    try {
      const res = await axios.get('https://uselessfacts.jsph.pl/random.json?language=en', { timeout: 10000 });
      await m.reply(`🤓 *Fun Fact*\n\n${res.data?.text || 'The human brain can process images in as little as 13 milliseconds!'}\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch {
      const facts = [
        'A day on Venus is longer than a year on Venus.',
        'Honey never expires. Archaeologists have found 3,000-year-old honey in Egyptian tombs that was still edible.',
        'The Eiffel Tower can be 15 cm taller during summer due to thermal expansion.',
        'Octopuses have three hearts and blue blood.',
        'Bananas are berries, but strawberries are not.',
      ];
      await m.reply(`🤓 *Fun Fact*\n\n${facts[Math.floor(Math.random() * facts.length)]}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── MEME ───
  if (['meme', 'memes', 'funnymeme'].includes(cmd)) {
    await m.React('😆');
    try {
      const res = await axios.get('https://meme-api.com/gimme', { timeout: 10000 });
      const meme = res.data;
      await conn.sendMessage(m.from, {
        image: { url: meme.url },
        caption: `😆 *${meme.title}*\n\n> ${config.BOT_NAME}`,
      }, { quoted: { key: m.key, message: m.message } });
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Meme failed: ${err.message}`);
    }
    return;
  }

  // ─── COINFLIP ───
  if (['coinflip', 'flip', 'coin'].includes(cmd)) {
    await m.React('🪙');
    const result = Math.random() > 0.5 ? 'HEADS 👑' : 'TAILS 🦅';
    await m.reply(`🪙 *Coin Flip*\n\n*Result:* ${result}\n\n> ${config.BOT_NAME}`);
    return;
  }

  // ─── DICE ───
  if (['dice', 'roll', 'rolldice'].includes(cmd)) {
    await m.React('🎲');
    const sides = parseInt(q) || 6;
    const result = Math.floor(Math.random() * sides) + 1;
    await m.reply(`🎲 *Dice Roll (d${sides})*\n\n*Result:* ${result}\n\n> ${config.BOT_NAME}`);
    return;
  }

  // ─── TRUTH OR DARE ───
  if (['truth', 'dare', 'tord'].includes(cmd)) {
    await m.React('🎭');
    try {
      const type = cmd === 'tord' ? (Math.random() > 0.5 ? 'truth' : 'dare') : cmd;
      const res = await axios.get(`https://api.truthordarebot.xyz/v1/${type}`, { timeout: 10000 });
      await m.reply(`🎭 *${type.toUpperCase()}*\n\n${res.data?.question || res.data?.dare || res.data?.truth || 'No question found'}\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch {
      const truths = ['What is your biggest fear?', 'Have you ever lied to your best friend?'];
      const dares = ['Do 10 push-ups right now!', 'Send a voice note saying something embarrassing!'];
      if (cmd === 'truth') await m.reply(`🎭 *TRUTH*\n\n${truths[Math.floor(Math.random() * truths.length)]}\n\n> ${config.BOT_NAME}`);
      else await m.reply(`🎭 *DARE*\n\n${dares[Math.floor(Math.random() * dares.length)]}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }
};

export default games;
