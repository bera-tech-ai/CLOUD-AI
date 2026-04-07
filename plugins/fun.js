import config from '../config.cjs';
import axios from 'axios';

const p = config.PREFIX;

// ─── Random arrays ────────────────────────────────────────────────────────────
const FLIRTS = [
  "Are you a magician? Because whenever I look at you, everyone else disappears.",
  "Do you have a map? I keep getting lost in your eyes.",
  "Is your name Google? Because you have everything I've been searching for.",
  "Are you a parking ticket? You've got 'fine' written all over you.",
  "Do you believe in love at first text? Or should I message again?",
  "If you were a vegetable, you'd be a cute-cumber.",
  "Are you a camera? Every time I look at you, I smile.",
  "Do you have a Band-Aid? I just scraped my knee falling for you.",
  "Are you an alien? Because you just abducted my heart.",
  "If beauty were time, you'd be an eternity.",
  "Are you from Kenya? Because you Nairobi-n me of my heart.",
  "Is your Wi-Fi name 'Love'? Because I'm feeling a connection.",
];

const PICKUPS = [
  "Are you a loan? Because you have my interest.",
  "Do you work at a bakery? Because you're a cutie pie.",
  "Are you made of copper and tellurium? Because you're CuTe.",
  "If you were a fruit, you'd be a fineapple.",
  "Are you a dictionary? Because you add meaning to my life.",
  "Is your name Wi-Fi? Because I'm feeling a connection.",
  "Are you a bank loan? Because you have my interest.",
  "Do you like Star Wars? Because Yoda one for me.",
  "Are you a time traveler? Because I see you in my future.",
  "Is your name Bluetooth? Because I'm feeling paired to you.",
  "Are you a volcano? Because I lava you.",
  "Do you like science? Because we have great chemistry.",
];

const COMPLIMENTS = [
  "You have the most beautiful soul I've ever encountered.",
  "Your smile could light up the darkest room.",
  "You're the kind of person that makes the world a better place.",
  "Your intelligence is as impressive as your kindness.",
  "You radiate positive energy wherever you go.",
  "You have an amazing ability to make people feel valued.",
  "Your creativity and passion inspire everyone around you.",
  "You're genuinely one of the most thoughtful people I know.",
  "Your presence makes everything more enjoyable.",
  "You handle everything with such grace and confidence.",
  "You have a heart of gold and it shows in everything you do.",
  "Your determination is truly inspiring.",
];

const INSULTS = [
  "You're not stupid, you just have bad luck thinking.",
  "I'd agree with you, but then we'd both be wrong.",
  "You're like a software update — nobody wants you right now.",
  "If laughter is the best medicine, your face must be curing diseases.",
  "I'd call you a tool, but that implies you're useful.",
  "You're the human equivalent of a participation trophy.",
  "I've met salads with more intelligence.",
  "You're proof that evolution can go in reverse.",
  "Your secrets are safe with me — I never pay attention to what you say.",
  "Light travels faster than sound. That's why you seemed bright until you spoke.",
];

const ADVICE = [
  "Don't watch the clock; do what it does — keep going. — Sam Levenson",
  "The secret of getting ahead is getting started. — Mark Twain",
  "It always seems impossible until it's done. — Nelson Mandela",
  "Don't let yesterday take up too much of today. — Will Rogers",
  "You are never too old to set another goal or dream a new dream. — C.S. Lewis",
  "The best time to plant a tree was 20 years ago. The second best time is now.",
  "Be yourself; everyone else is already taken. — Oscar Wilde",
  "In the middle of every difficulty lies opportunity. — Albert Einstein",
  "Success is not final, failure is not fatal: courage to continue is what counts.",
  "Dream big, start small, but most of all start. — Simon Sinek",
  "The only way to do great work is to love what you do. — Steve Jobs",
  "Your attitude determines your direction. Choose wisely.",
];

const ROASTS = [
  "If I wanted to hear from an idiot, I'd watch your TikToks.",
  "You're the reason shampoo has instructions.",
  "I've seen better arguments in a kindergarten class.",
  "Your brain must be the size of your personality — microscopic.",
  "You're like a cloud. When you disappear, it's a beautiful day.",
  "I'd roast you harder, but my mom said I'm not allowed to burn trash.",
  "You're a pizza without cheese — pointless and disappointing.",
  "If stupidity was a sport, you'd be an Olympian.",
];

const RIZZ = [
  "Baby, are you a WiFi signal? Because I'm getting weak in the knees.",
  "You must be tired because you've been running through my mind all day.",
  "Is your name Grace? Because you're amazing.",
  "Are you a charger? Because without you, I'd die.",
  "Do you have a name, or can I call you mine?",
  "Are you a shooting star? Because you're once-in-a-lifetime.",
  "If you were a song, you'd be the only one on my playlist.",
  "You must be a bank because you have my full interest.",
];

const EIGHT_BALL = [
  '✅ It is certain.',
  '✅ It is decidedly so.',
  '✅ Without a doubt.',
  '✅ Yes, definitely.',
  '✅ You may rely on it.',
  '✅ As I see it, yes.',
  '✅ Most likely.',
  '✅ Outlook good.',
  '✅ Yes.',
  '✅ Signs point to yes.',
  '🔵 Reply hazy, try again.',
  '🔵 Ask again later.',
  '🔵 Better not tell you now.',
  '🔵 Cannot predict now.',
  '🔵 Concentrate and ask again.',
  "❌ Don't count on it.",
  '❌ My reply is no.',
  '❌ My sources say no.',
  '❌ Outlook not so good.',
  '❌ Very doubtful.',
];

const rand = arr => arr[Math.floor(Math.random() * arr.length)];

const fun = async (m, conn) => {
  if (!m.body) return;
  const body = m.body.trim();
  if (!body.startsWith(config.PREFIX)) return;
  const args = body.slice(config.PREFIX.length).trim().split(/\s+/);
  const cmd = args[0].toLowerCase();
  const q = args.slice(1).join(' ');

  // ─── 8BALL ────────────────────────────────────────────────────────────────
  if (['8ball', 'ball', 'ask', 'magic8', '8b'].includes(cmd)) {
    if (!q) return m.reply(`🎱 *Magic 8-Ball*\n\nUsage: ${p}8ball <your question>\n\nExample: ${p}8ball Will I be rich?\n\n> ${config.BOT_NAME}`);
    const answer = rand(EIGHT_BALL);
    await m.reply(`🎱 *Magic 8-Ball*\n\n❓ *Q:* ${q}\n\n${answer}\n\n> ${config.BOT_NAME}`);
    await m.React('🎱');
    return;
  }

  // ─── CALCULATE ────────────────────────────────────────────────────────────
  if (['calculate', 'calc', 'math', 'solve', 'compute'].includes(cmd)) {
    if (!q) return m.reply(`🧮 *Calculator*\n\nUsage: ${p}calc <expression>\n\nExamples:\n• ${p}calc 2 + 2\n• ${p}calc (5 * 8) / 2\n• ${p}calc 100 ^ 2\n• ${p}calc sqrt(144)\n\n> ${config.BOT_NAME}`);
    try {
      // Safe math eval — only allow numbers, operators, and math functions
      const clean = q.replace(/\^/g, '**')
        .replace(/[^0-9+\-*/().,% \t\nsqrtabsceilflooroundpiE]/gi, '');
      const safeExpr = clean
        .replace(/sqrt/g, 'Math.sqrt')
        .replace(/abs/g, 'Math.abs')
        .replace(/ceil/g, 'Math.ceil')
        .replace(/floor/g, 'Math.floor')
        .replace(/round/g, 'Math.round')
        .replace(/\bpi\b/gi, 'Math.PI')
        .replace(/\bE\b/g, 'Math.E');
      // Use Function instead of eval for slightly better safety
      const result = Function(`'use strict'; return (${safeExpr})`)();
      if (typeof result !== 'number' || !isFinite(result)) throw new Error('Invalid result');
      await m.reply(`🧮 *Calculator*\n\n📝 *Expression:* \`${q}\`\n✅ *Result:* \`${result}\`\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch {
      await m.React('❌');
      await m.reply(`❌ *Invalid Expression*\n\nCouldn't compute: \`${q}\`\n\nTry: ${p}calc 5 * 8 + 2\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── FLIRT ────────────────────────────────────────────────────────────────
  if (['flirt', 'flirtme', 'charm'].includes(cmd)) {
    const target = m.mentionedJid?.[0];
    const targetName = target ? `@${target.split('@')[0]}` : (q || 'you');
    await m.reply(`💕 *Flirt*\n\n${targetName}, ${rand(FLIRTS)}\n\n> ${config.BOT_NAME}`, { mentions: target ? [target] : [] });
    await m.React('💕');
    return;
  }

  // ─── PICKUP LINE ──────────────────────────────────────────────────────────
  if (['pickup', 'pickupline', 'pl', 'opener'].includes(cmd)) {
    await m.reply(`😏 *Pickup Line*\n\n${rand(PICKUPS)}\n\n> ${config.BOT_NAME}`);
    await m.React('😏');
    return;
  }

  // ─── COMPLIMENT ───────────────────────────────────────────────────────────
  if (['compliment', 'comp', 'praise', 'complement'].includes(cmd)) {
    const target = m.mentionedJid?.[0];
    const targetName = target ? `@${target.split('@')[0]}` : (q || 'you');
    await m.reply(`💖 *Compliment*\n\n${targetName}, ${rand(COMPLIMENTS)}\n\n> ${config.BOT_NAME}`, { mentions: target ? [target] : [] });
    await m.React('💖');
    return;
  }

  // ─── INSULT ───────────────────────────────────────────────────────────────
  if (['insult', 'roast', 'burn', 'diss'].includes(cmd)) {
    const target = m.mentionedJid?.[0];
    const targetName = target ? `@${target.split('@')[0]}` : (q || 'you');
    await m.reply(`🔥 *Roast*\n\n${targetName}, ${rand(INSULTS)}\n\n_Just kidding!_ 😂\n\n> ${config.BOT_NAME}`, { mentions: target ? [target] : [] });
    await m.React('🔥');
    return;
  }

  // ─── ADVICE ───────────────────────────────────────────────────────────────
  if (['advice', 'tip', 'wisdom', 'motivate', 'inspire', 'quote'].includes(cmd)) {
    await m.reply(`💡 *Daily Advice*\n\n"${rand(ADVICE)}"\n\n> ${config.BOT_NAME}`);
    await m.React('💡');
    return;
  }

  // ─── RIZZ ─────────────────────────────────────────────────────────────────
  if (['rizz', 'rizzup', 'charm2'].includes(cmd)) {
    const target = m.mentionedJid?.[0];
    const targetName = target ? `@${target.split('@')[0]}` : (q || 'you');
    await m.reply(`✨ *Rizz*\n\n${targetName}, ${rand(RIZZ)}\n\n> ${config.BOT_NAME}`, { mentions: target ? [target] : [] });
    await m.React('✨');
    return;
  }

  // ─── BIBLE VERSE ──────────────────────────────────────────────────────────
  if (['bible', 'verse', 'scripture', 'bibleverse'].includes(cmd)) {
    await m.React('📖');
    try {
      const res = await axios.get('https://bible-api.com/?random=verse', { timeout: 10000 });
      const v = res.data;
      await m.reply(`📖 *Bible Verse*\n\n_"${v.text.trim()}"_\n\n📌 *${v.reference}*\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch {
      const verses = [
        { text: "For I know the plans I have for you, declares the Lord, plans to prosper you and not to harm you.", ref: "Jeremiah 29:11" },
        { text: "I can do all things through Christ who strengthens me.", ref: "Philippians 4:13" },
        { text: "The Lord is my shepherd; I shall not want.", ref: "Psalm 23:1" },
        { text: "Trust in the Lord with all your heart and lean not on your own understanding.", ref: "Proverbs 3:5" },
        { text: "Be strong and courageous. Do not be afraid; do not be discouraged.", ref: "Joshua 1:9" },
      ];
      const v = rand(verses);
      await m.reply(`📖 *Bible Verse*\n\n_"${v.text}"_\n\n📌 *${v.ref}*\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── DARE (already in games.js but alias here too) ────────────────────────
  // Handled in games.js, skip
};

export default fun;
