import config from '../config.cjs';
import axios from 'axios';

const p = config.PREFIX;

const info = async (m, conn) => {
  if (!m.body) return;
  const body = m.body.trim();
  if (!body.startsWith(config.PREFIX)) return;
  const args = body.slice(config.PREFIX.length).trim().split(/\s+/);
  const cmd = args[0].toLowerCase();
  const q = args.slice(1).join(' ');

  // ─── CURRENCY CONVERTER ───────────────────────────────────────────────────
  if (['currency', 'convert', 'rate', 'exchange', 'fx'].includes(cmd)) {
    if (!q) return m.reply(
`💱 *Currency Converter*

Usage: ${p}currency <amount> <FROM> to <TO>

Examples:
• ${p}currency 100 USD to KES
• ${p}currency 500 KES to USD
• ${p}currency 1 BTC to USD
• ${p}currency 50 EUR to GBP

> ${config.BOT_NAME}`);

    await m.React('💱');
    try {
      // Parse: "100 USD to KES" or "100 USD KES"
      const match = q.match(/^([\d.]+)\s+([A-Za-z]+)\s+(?:to\s+)?([A-Za-z]+)$/i);
      if (!match) throw new Error('Format: amount FROM to TO  e.g. 100 USD to KES');
      const [, amountStr, from, to] = match;
      const amount = parseFloat(amountStr);
      const fromUpper = from.toUpperCase();
      const toUpper = to.toUpperCase();

      const res = await axios.get(`https://api.exchangerate-api.com/v4/latest/${fromUpper}`, { timeout: 10000 });
      const rates = res.data?.rates;
      if (!rates) throw new Error('Currency data unavailable');
      if (!rates[toUpper]) throw new Error(`Unknown currency: ${toUpper}`);

      const result = (amount * rates[toUpper]).toFixed(4);
      const rate = rates[toUpper].toFixed(6);

      await m.reply(
`💱 *Currency Conversion*
━━━━━━━━━━━━━━━━━━━━━

💰 *${amount} ${fromUpper}* = *${result} ${toUpper}*

📊 *Rate:* 1 ${fromUpper} = ${rate} ${toUpper}
🔄 *Inverse:* 1 ${toUpper} = ${(1/rates[toUpper]).toFixed(6)} ${fromUpper}

_Rates from exchangerate-api.com_

> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *Currency Error*\n\n${err.message}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── COUNTRY INFO ─────────────────────────────────────────────────────────
  if (['country', 'countryinfo', 'nation', 'countrydata'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${p}country <country name>\n\nExample: ${p}country Kenya\n\n> ${config.BOT_NAME}`);
    await m.React('🌍');
    try {
      const res = await axios.get(`https://restcountries.com/v3.1/name/${encodeURIComponent(q)}`, { timeout: 10000 });
      const c = res.data?.[0];
      if (!c) throw new Error('Country not found');

      const currencies = Object.values(c.currencies || {}).map(cu => `${cu.name} (${cu.symbol || '?'})`).join(', ') || 'N/A';
      const langs = Object.values(c.languages || {}).join(', ') || 'N/A';
      const borders = (c.borders || []).slice(0, 6).join(', ') || 'None';
      const pop = c.population?.toLocaleString() || 'N/A';
      const area = c.area?.toLocaleString() || 'N/A';
      const capital = (c.capital || ['N/A'])[0];
      const region = `${c.subregion || ''} ${c.region || ''}`.trim();
      const flag = c.flag || '';
      const callingCode = (c.idd?.root || '') + (c.idd?.suffixes?.[0] || '');
      const tld = (c.tld || []).join(', ') || 'N/A';
      const timezones = (c.timezones || []).slice(0, 3).join(', ');

      await m.reply(
`${flag} *${c.name?.common}* (${c.name?.official})
━━━━━━━━━━━━━━━━━━━━━

🏛️ *Capital:* ${capital}
🌍 *Region:* ${region}
👥 *Population:* ${pop}
📐 *Area:* ${area} km²
💰 *Currency:* ${currencies}
🗣️ *Languages:* ${langs}
📞 *Calling Code:* ${callingCode || 'N/A'}
🌐 *TLD:* ${tld}
⏰ *Timezones:* ${timezones || 'N/A'}
🤝 *Borders:* ${borders}
🏳️ *Continents:* ${(c.continents || []).join(', ')}

> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *Country Not Found*\n\n${err.message}\n\nTry: ${p}country Nigeria\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── POKEMON / POKEDEX ────────────────────────────────────────────────────
  if (['pokedex', 'pokemon', 'poke', 'dex'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${p}pokedex <pokemon name or number>\n\nExamples:\n• ${p}pokedex pikachu\n• ${p}pokedex charizard\n• ${p}pokedex 25\n\n> ${config.BOT_NAME}`);
    await m.React('⚡');
    try {
      const res = await axios.get(`https://pokeapi.co/api/v2/pokemon/${q.toLowerCase().replace(/\s+/g, '-')}`, { timeout: 12000 });
      const pk = res.data;

      const types = pk.types.map(t => t.type.name.charAt(0).toUpperCase() + t.type.name.slice(1)).join(' / ');
      const abilities = pk.abilities.map(a => a.ability.name.replace('-', ' ')).join(', ');
      const stats = pk.stats.map(s => `${s.stat.name.padEnd(15)}: ${s.base_stat}`).join('\n');
      const moves = pk.moves.slice(0, 5).map(mv => mv.move.name.replace('-', ' ')).join(', ');

      const imgUrl = pk.sprites?.other?.['official-artwork']?.front_default
        || pk.sprites?.front_default;

      const typeEmojis = {
        fire:'🔥', water:'💧', grass:'🌿', electric:'⚡', ice:'❄️',
        fighting:'🥊', poison:'☠️', ground:'🌍', flying:'🦅', psychic:'🔮',
        bug:'🐛', rock:'🪨', ghost:'👻', dragon:'🐉', dark:'🌑',
        steel:'⚙️', fairy:'✨', normal:'⭐',
      };
      const typeStr = pk.types.map(t => `${typeEmojis[t.type.name] || '❓'} ${t.type.name}`).join(' / ');

      if (imgUrl) {
        await conn.sendMessage(m.from, {
          image: { url: imgUrl },
          caption:
`⚡ *#${pk.id} — ${pk.name.toUpperCase()}*
━━━━━━━━━━━━━━━━━━━━━

🏷️ *Type:* ${typeStr}
📏 *Height:* ${pk.height / 10}m
⚖️ *Weight:* ${pk.weight / 10}kg
✨ *Abilities:* ${abilities}

📊 *Base Stats:*
\`\`\`
${stats}
\`\`\`
🎮 *Moves (sample):* ${moves}

> ${config.BOT_NAME}`,
        }, { quoted: { key: m.key, message: m.message } });
      } else {
        await m.reply(`⚡ *#${pk.id} — ${pk.name.toUpperCase()}*\n🏷️ Type: ${types}\n📏 Height: ${pk.height/10}m | ⚖️ Weight: ${pk.weight/10}kg\n✨ Abilities: ${abilities}\n\n> ${config.BOT_NAME}`);
      }
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *Pokémon Not Found*\n\nNo Pokémon named "${q}"\n\nTry: ${p}pokedex pikachu\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── NEWS ─────────────────────────────────────────────────────────────────
  if (['news', 'headlines', 'trending', 'breakingnews'].includes(cmd)) {
    const category = q || 'general';
    await m.React('📰');
    try {
      // Free news API — no key required
      const validCats = ['business','entertainment','health','science','sports','technology','general'];
      const cat = validCats.includes(category.toLowerCase()) ? category.toLowerCase() : 'general';
      const res = await axios.get(`https://saurav.tech/NewsAPI/top-headlines/category/${cat}/us.json`, { timeout: 12000 });
      const articles = res.data?.articles?.slice(0, 5);
      if (!articles?.length) throw new Error('No news available');

      const list = articles.map((a, i) =>
        `*${i + 1}.* ${a.title}\n   📰 ${a.source?.name || 'Unknown'} | 🔗 ${a.url?.slice(0, 50)}...`
      ).join('\n\n');

      await m.reply(
`📰 *Top ${cat.charAt(0).toUpperCase() + cat.slice(1)} News*
━━━━━━━━━━━━━━━━━━━━━

${list}

━━━━━━━━━━━━━━━━━━━━━
💡 Categories: business, sports, tech, health, science, entertainment

> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *News Unavailable*\n\n${err.message}\n\nTry: ${p}news sports\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── HOROSCOPE ────────────────────────────────────────────────────────────
  if (['horoscope', 'zodiac', 'star', 'starsign'].includes(cmd)) {
    const signs = ['aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn','aquarius','pisces'];
    const signEmojis = { aries:'♈',taurus:'♉',gemini:'♊',cancer:'♋',leo:'♌',virgo:'♍',libra:'♎',scorpio:'♏',sagittarius:'♐',capricorn:'♑',aquarius:'♒',pisces:'♓' };

    if (!q || !signs.includes(q.toLowerCase())) {
      return m.reply(
`♈ *Horoscope*

Usage: ${p}horoscope <zodiac sign>

Signs: ${signs.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(', ')}

> ${config.BOT_NAME}`);
    }

    await m.React('⭐');
    try {
      const sign = q.toLowerCase();
      const res = await axios.get(`https://horoscope-app-api.vercel.app/api/v1/get-horoscope/daily?sign=${sign}&day=TODAY`, { timeout: 10000 });
      const h = res.data?.data;
      if (!h) throw new Error('Horoscope unavailable');

      await m.reply(
`${signEmojis[sign]} *${sign.charAt(0).toUpperCase() + sign.slice(1)} Horoscope*
━━━━━━━━━━━━━━━━━━━━━

📅 *Date:* ${h.date || 'Today'}

${h.horoscope_data}

━━━━━━━━━━━━━━━━━━━━━
> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch {
      // Fallback with generated horoscope
      const forecasts = [
        "Today brings new opportunities. Stay open to unexpected changes.",
        "Your energy is high today — use it to tackle long-overdue tasks.",
        "Relationships take center stage. A meaningful conversation awaits.",
        "Focus on your goals. Progress is closer than you think.",
        "Trust your instincts today. Your gut feeling is rarely wrong.",
        "A challenge you face today will make you stronger tomorrow.",
      ];
      const sign = q.toLowerCase();
      await m.reply(`${signEmojis[sign]} *${sign.charAt(0).toUpperCase() + sign.slice(1)} Horoscope* 🌟\n\n${forecasts[Math.floor(Math.random() * forecasts.length)]}\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    }
    return;
  }

  // ─── IMDB / MOVIE INFO ────────────────────────────────────────────────────
  if (['movie', 'imdb', 'film', 'movieinfo'].includes(cmd)) {
    if (!q) return m.reply(`🎬 Usage: ${p}movie <movie name>\n\nExample: ${p}movie Avengers Endgame\n\n> ${config.BOT_NAME}`);
    await m.React('🎬');
    try {
      const res = await axios.get(`https://www.omdbapi.com/?t=${encodeURIComponent(q)}&apikey=trilogy`, { timeout: 12000 });
      const mv = res.data;
      if (mv.Response === 'False') throw new Error(mv.Error || 'Movie not found');

      const poster = mv.Poster !== 'N/A' ? mv.Poster : null;
      const info =
`🎬 *${mv.Title}* (${mv.Year})
━━━━━━━━━━━━━━━━━━━━━

⭐ *Rating:* ${mv.imdbRating}/10 (${mv.imdbVotes} votes)
🎭 *Genre:* ${mv.Genre}
🎬 *Director:* ${mv.Director}
🎤 *Cast:* ${mv.Actors}
🌐 *Language:* ${mv.Language}
📅 *Released:* ${mv.Released}
⏱️ *Runtime:* ${mv.Runtime}
🏆 *Awards:* ${mv.Awards}

📖 *Plot:*
${mv.Plot}

> ${config.BOT_NAME}`;

      if (poster) {
        await conn.sendMessage(m.from, { image: { url: poster }, caption: info }, { quoted: { key: m.key, message: m.message } });
      } else {
        await m.reply(info);
      }
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *Movie Not Found*\n\n${err.message}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── NPM PACKAGE ──────────────────────────────────────────────────────────
  if (['npm', 'npminfo', 'npmpackage', 'package'].includes(cmd)) {
    if (!q) return m.reply(`📦 Usage: ${p}npm <package name>\n\nExample: ${p}npm axios\n\n> ${config.BOT_NAME}`);
    await m.React('📦');
    try {
      const res = await axios.get(`https://registry.npmjs.org/${encodeURIComponent(q)}`, { timeout: 10000 });
      const pkg = res.data;
      const latest = pkg['dist-tags']?.latest;
      const info = pkg.versions?.[latest];

      await m.reply(
`📦 *NPM Package: ${pkg.name}*
━━━━━━━━━━━━━━━━━━━━━

📌 *Version:* ${latest}
📝 *Description:* ${pkg.description || 'N/A'}
👤 *Author:* ${typeof pkg.author === 'string' ? pkg.author : pkg.author?.name || 'N/A'}
📄 *License:* ${info?.license || 'N/A'}
🔗 *Homepage:* ${pkg.homepage || 'N/A'}
📥 *Weekly Downloads:* N/A
📦 *Unpacked Size:* ${info?.dist?.unpackedSize ? (info.dist.unpackedSize / 1024).toFixed(0) + ' KB' : 'N/A'}
🔧 *Dependencies:* ${Object.keys(info?.dependencies || {}).length}

📥 Install: \`npm install ${pkg.name}\`

> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *Package Not Found*\n\n${err.message}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── GITHUB USER ──────────────────────────────────────────────────────────
  if (['github', 'ghuser', 'gituser', 'ghprofile'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${p}github <username>\n\nExample: ${p}github torvalds\n\n> ${config.BOT_NAME}`);
    await m.React('💻');
    try {
      const [userRes, repoRes] = await Promise.all([
        axios.get(`https://api.github.com/users/${q}`, { timeout: 10000 }),
        axios.get(`https://api.github.com/users/${q}/repos?sort=stars&per_page=3`, { timeout: 10000 }),
      ]);
      const u = userRes.data;
      const topRepos = repoRes.data.map(r => `• ${r.name} ⭐${r.stargazers_count}`).join('\n');

      const info =
`💻 *GitHub: @${u.login}*
━━━━━━━━━━━━━━━━━━━━━

👤 *Name:* ${u.name || 'N/A'}
📝 *Bio:* ${u.bio || 'N/A'}
📍 *Location:* ${u.location || 'N/A'}
🏢 *Company:* ${u.company || 'N/A'}
📁 *Repos:* ${u.public_repos}
👥 *Followers:* ${u.followers?.toLocaleString()}
👤 *Following:* ${u.following}
🔗 ${u.html_url}

⭐ *Top Repos:*
${topRepos || 'N/A'}

> ${config.BOT_NAME}`;

      await conn.sendMessage(m.from, {
        image: { url: u.avatar_url },
        caption: info,
      }, { quoted: { key: m.key, message: m.message } });
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *GitHub User Not Found*\n\n${err.message}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }
};

export default info;
