import config from '../config.cjs';
import axios from 'axios';
import crypto from 'crypto';
import { randomUUID } from 'crypto';
import os from 'os';

const p = config.PREFIX;

// ─── HTTP STATUS CODES ────────────────────────────────────────────────────────
const HTTP_CODES = {
  100:'Continue',101:'Switching Protocols',102:'Processing',
  200:'OK',201:'Created',202:'Accepted',204:'No Content',206:'Partial Content',
  301:'Moved Permanently',302:'Found',304:'Not Modified',307:'Temporary Redirect',308:'Permanent Redirect',
  400:'Bad Request',401:'Unauthorized',403:'Forbidden',404:'Not Found',405:'Method Not Allowed',
  408:'Request Timeout',409:'Conflict',410:'Gone',413:'Payload Too Large',414:'URI Too Long',
  415:'Unsupported Media Type',422:'Unprocessable Entity',429:'Too Many Requests',
  500:'Internal Server Error',501:'Not Implemented',502:'Bad Gateway',503:'Service Unavailable',504:'Gateway Timeout',
};

// ─── SUBNET CALCULATOR ───────────────────────────────────────────────────────
function calcSubnet(cidr) {
  const [ip, bits] = cidr.split('/');
  const prefix = parseInt(bits);
  if (!ip || isNaN(prefix) || prefix < 0 || prefix > 32) throw new Error('Invalid CIDR');
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => isNaN(n) || n < 0 || n > 255)) throw new Error('Invalid IP');
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  const ipInt = (parts[0] << 24 | parts[1] << 16 | parts[2] << 8 | parts[3]) >>> 0;
  const network = (ipInt & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const toIP = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  const hosts = prefix >= 31 ? (32 - prefix === 0 ? 0 : 2) : Math.pow(2, 32 - prefix) - 2;
  return { network: toIP(network), broadcast: toIP(broadcast), mask: toIP(mask), hosts, first: toIP(network + 1), last: toIP(broadcast - 1) };
}

const techPlugin = async (m, conn) => {
  if (!m.body) return;
  const body = m.body.trim();
  if (!body.startsWith(p)) return;
  const args = body.slice(p.length).trim().split(/\s+/);
  const cmd = args[0].toLowerCase();
  const q = args.slice(1).join(' ');

  // ─── IP LOOKUP ───────────────────────────────────────────────────────────
  if (['iplookup', 'ip', 'ipinfo', 'geoip', 'myip'].includes(cmd)) {
    const target = q || null;
    await m.React('🌐');
    try {
      const url = target ? `http://ip-api.com/json/${encodeURIComponent(target)}?fields=status,message,query,country,regionName,city,zip,lat,lon,timezone,isp,org,as,mobile,proxy,hosting` : 'http://ip-api.com/json/?fields=status,message,query,country,regionName,city,zip,lat,lon,timezone,isp,org,as,mobile,proxy,hosting';
      const res = await axios.get(url, { timeout: 10000 });
      const d = res.data;
      if (d.status !== 'success') throw new Error(d.message || 'Lookup failed');
      const flags = [d.mobile && '📱 Mobile', d.proxy && '🔒 Proxy/VPN', d.hosting && '🖥️ Hosting'].filter(Boolean).join(' | ') || '✅ Clean';
      await m.reply(
`🌐 *IP Lookup: ${d.query}*

📍 *Location*
  Country   : ${d.country || 'N/A'}
  Region    : ${d.regionName || 'N/A'}
  City      : ${d.city || 'N/A'}
  ZIP       : ${d.zip || 'N/A'}
  Coords    : ${d.lat}, ${d.lon}
  Timezone  : ${d.timezone || 'N/A'}

🏢 *Network*
  ISP       : ${d.isp || 'N/A'}
  Org       : ${d.org || 'N/A'}
  AS        : ${d.as || 'N/A'}

🔍 *Flags*  ${flags}

> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ IP lookup failed: ${err.message}`);
    }
    return;
  }

  // ─── DNS LOOKUP ──────────────────────────────────────────────────────────
  if (['dns', 'dnslookup', 'nslookup', 'resolve'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${p}dns <domain>\n\nExample: ${p}dns google.com`);
    await m.React('🔎');
    try {
      const types = ['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME'];
      const results = await Promise.all(types.map(async type => {
        try {
          const res = await axios.get(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(q)}&type=${type}`, {
            headers: { Accept: 'application/dns-json' }, timeout: 8000,
          });
          const answers = res.data?.Answer || [];
          return answers.length ? `*${type}:* ${answers.map(a => a.data).join(', ')}` : null;
        } catch { return null; }
      }));
      const found = results.filter(Boolean);
      if (!found.length) throw new Error('No DNS records found');
      await m.reply(`🔎 *DNS Lookup: ${q}*\n\n${found.join('\n')}\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ DNS lookup failed: ${err.message}`);
    }
    return;
  }

  // ─── HASH ────────────────────────────────────────────────────────────────
  if (['hash', 'md5', 'sha256', 'sha512', 'sha1'].includes(cmd)) {
    if (!q && cmd === 'hash') return m.reply(`❌ Usage: ${p}hash <text>\nOr: ${p}md5 <text> | ${p}sha256 <text> | ${p}sha512 <text>`);
    const text = q || args.slice(1).join(' ');
    if (!text) return m.reply(`❌ Usage: ${p}${cmd} <text>`);
    await m.React('🔐');
    const algos = cmd === 'hash' ? ['md5','sha1','sha256','sha512'] : [cmd];
    const lines = algos.map(a => `*${a.toUpperCase()}:*\n\`${crypto.createHash(a).update(text).digest('hex')}\``);
    await m.reply(`🔐 *Hash Generator*\n\n📝 *Input:* ${text}\n\n${lines.join('\n\n')}\n\n> ${config.BOT_NAME}`);
    await m.React('✅');
    return;
  }

  // ─── UUID ────────────────────────────────────────────────────────────────
  if (['uuid', 'guid', 'generateuuid'].includes(cmd)) {
    await m.React('🆔');
    const count = Math.min(parseInt(q) || 1, 10);
    const uuids = Array.from({ length: count }, () => randomUUID());
    await m.reply(`🆔 *UUID Generator*\n\n${uuids.map((u, i) => `${i + 1}. \`${u}\``).join('\n')}\n\n> ${config.BOT_NAME}`);
    await m.React('✅');
    return;
  }

  // ─── TIMESTAMP ───────────────────────────────────────────────────────────
  if (['timestamp', 'unix', 'unixtime', 'epoch'].includes(cmd)) {
    await m.React('🕐');
    if (q) {
      const num = parseInt(q);
      if (!isNaN(num)) {
        const ms = num > 9999999999 ? num : num * 1000;
        const d = new Date(ms);
        await m.reply(`🕐 *Timestamp Converter*\n\n⏱️ *Unix:* ${num}\n📅 *UTC:* ${d.toUTCString()}\n🌍 *Local:* ${d.toLocaleString()}\n📋 *ISO:* ${d.toISOString()}\n\n> ${config.BOT_NAME}`);
      } else {
        const d = new Date(q);
        if (isNaN(d.getTime())) return m.reply(`❌ Invalid date: ${q}`);
        await m.reply(`🕐 *Date to Unix*\n\n📅 *Input:* ${q}\n⏱️ *Seconds:* ${Math.floor(d.getTime()/1000)}\n⏱️ *Milliseconds:* ${d.getTime()}\n\n> ${config.BOT_NAME}`);
      }
    } else {
      const now = Date.now();
      await m.reply(`🕐 *Current Timestamp*\n\n⏱️ *Seconds:* ${Math.floor(now/1000)}\n⏱️ *Milliseconds:* ${now}\n📅 *UTC:* ${new Date().toUTCString()}\n📋 *ISO:* ${new Date().toISOString()}\n\n> ${config.BOT_NAME}`);
    }
    await m.React('✅');
    return;
  }

  // ─── HTTP STATUS CODE ────────────────────────────────────────────────────
  if (['httpcode', 'httpstatus', 'statuscode', 'http'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${p}httpcode <code>\n\nExample: ${p}httpcode 404`);
    const code = parseInt(q);
    const name = HTTP_CODES[code];
    if (!name) return m.reply(`❌ Unknown HTTP status code: ${code}`);
    const cat = code < 200 ? '1xx Informational' : code < 300 ? '2xx Success' : code < 400 ? '3xx Redirection' : code < 500 ? '4xx Client Error' : '5xx Server Error';
    const emoji = code < 300 ? '✅' : code < 400 ? '↩️' : code < 500 ? '⚠️' : '❌';
    await m.reply(`${emoji} *HTTP ${code} — ${name}*\n\n📂 *Category:* ${cat}\n\n> ${config.BOT_NAME}`);
    await m.React('✅');
    return;
  }

  // ─── JSON FORMATTER ──────────────────────────────────────────────────────
  if (['jsonfmt', 'jsonformat', 'jsonbeautify', 'jsonparse', 'json'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${p}jsonfmt <json text>\n\nExample: ${p}jsonfmt {"name":"Bruce","age":25}`);
    await m.React('📋');
    try {
      const parsed = JSON.parse(q);
      const pretty = JSON.stringify(parsed, null, 2);
      const keys = Object.keys(parsed);
      await m.reply(`📋 *JSON Formatter*\n\n✅ *Valid JSON*\n🔑 *Keys:* ${keys.slice(0, 10).join(', ')}${keys.length > 10 ? '...' : ''}\n📊 *Size:* ${JSON.stringify(parsed).length} chars\n\n\`\`\`\n${pretty.slice(0, 1500)}${pretty.length > 1500 ? '\n...(truncated)' : ''}\n\`\`\`\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *Invalid JSON*\n\n${err.message}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── URL ENCODE ──────────────────────────────────────────────────────────
  if (['urlencode', 'encode', 'encodeurl'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${p}urlencode <text>`);
    const encoded = encodeURIComponent(q);
    await m.reply(`🔗 *URL Encode*\n\n📝 *Input:* ${q}\n✅ *Encoded:* ${encoded}\n\n> ${config.BOT_NAME}`);
    await m.React('✅');
    return;
  }

  // ─── URL DECODE ──────────────────────────────────────────────────────────
  if (['urldecode', 'decode', 'decodeurl'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${p}urldecode <encoded text>`);
    try {
      const decoded = decodeURIComponent(q);
      await m.reply(`🔗 *URL Decode*\n\n📝 *Input:* ${q}\n✅ *Decoded:* ${decoded}\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch {
      await m.React('❌');
      await m.reply(`❌ Invalid URL encoding`);
    }
    return;
  }

  // ─── SUBNET CALCULATOR ──────────────────────────────────────────────────
  if (['subnet', 'cidr', 'ipcalc'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${p}subnet <ip/cidr>\n\nExample: ${p}subnet 192.168.1.0/24`);
    await m.React('🌐');
    try {
      const r = calcSubnet(q);
      await m.reply(
`🌐 *Subnet Calculator*

📋 *CIDR:*       ${q}
🔲 *Network:*    ${r.network}
📡 *Broadcast:*  ${r.broadcast}
🎭 *Mask:*       ${r.mask}
🏠 *First Host:* ${r.first}
🏠 *Last Host:*  ${r.last}
👥 *Total Hosts:* ${r.hosts.toLocaleString()}

> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ ${err.message}\n\nExample: ${p}subnet 10.0.0.0/8`);
    }
    return;
  }

  // ─── BERAHOST — List Available Bots ────────────────────────────────────
  if (['berahost', 'botlist', 'bots', 'hostbots'].includes(cmd)) {
    await m.React('🚀');
    try {
      const res = await axios.get(`${config.BERAHOST_API}/api/bots`, {
        headers: { 'x-api-key': config.BERAHOST_KEY }, timeout: 10000,
      });
      const bots = res.data;
      if (!Array.isArray(bots) || !bots.length) throw new Error('No bots found on the platform');
      const list = bots.map((b, i) =>
        `*${i + 1}. ${b.name}* _(ID: ${b.id})_\n   📝 ${(b.description || 'No description').slice(0, 80)}\n   🔗 ${b.repoUrl || 'N/A'}`
      ).join('\n\n');
      await m.reply(
`🚀 *BERAHOST — Available Bots*
━━━━━━━━━━━━━━━━━━━━━

${list}

━━━━━━━━━━━━━━━━━━━━━
🌐 *Platform:* ${config.BERAHOST_API}
💡 Use *${p}deploy <botId> <SESSION_ID>* to deploy a bot

> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *BERAHOST Error*\n\n${err.message}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── BERAHOST — Deploy a Bot ────────────────────────────────────────────
  if (['deploy', 'botdeploy', 'deploybot'].includes(cmd)) {
    if (!q) return m.reply(
`❌ *Usage:* ${p}deploy <botId> <SESSION_ID> [KEY=VALUE ...]

*Example:*
${p}deploy 1 Gifted~yourSessionHere
${p}deploy 2 Gifted~yourSessionHere PORT=3001

> ${config.BOT_NAME}`);

    const parts = q.split(/\s+/);
    if (parts.length < 2) return m.reply(`❌ *Both botId and SESSION_ID are required*\n\nUsage: ${p}deploy <botId> <SESSION_ID>\n\n> ${config.BOT_NAME}`);

    const botId = parseInt(parts[0]);
    if (isNaN(botId)) return m.reply(`❌ *botId must be a number*\n\nExample: ${p}deploy 1 Gifted~yourSession\n\n> ${config.BOT_NAME}`);

    const sessionId = parts[1];
    const envVars = { SESSION_ID: sessionId };

    // Parse optional extra KEY=VALUE pairs
    for (let i = 2; i < parts.length; i++) {
      const [k, ...v] = parts[i].split('=');
      if (k && v.length) envVars[k.trim()] = v.join('=').trim();
    }

    await m.React('⏳');

    try {
      const res = await axios.post(`${config.BERAHOST_API}/api/deployments`, {
        botId,
        envVars,
      }, {
        headers: {
          'x-api-key': config.BERAHOST_KEY,
          'Content-Type': 'application/json',
        },
        timeout: 20000,
      });

      const deploy = res.data;
      const envList = Object.keys(envVars).map(k => `   • ${k}`).join('\n');

      await m.reply(
`✅ *Bot Deployed Successfully!*
━━━━━━━━━━━━━━━━━━━━━

🆔 *Deployment ID:* ${deploy.id}
🤖 *Bot ID:* ${botId}
📊 *Status:* ${deploy.status || 'starting'}
🌐 *URL:* ${deploy.url || 'Assigned shortly'}
🕐 *Created:* ${deploy.createdAt ? new Date(deploy.createdAt).toLocaleString() : 'Now'}

📦 *Env Vars Deployed:*
${envList}

━━━━━━━━━━━━━━━━━━━━━
💡 Use *${p}deploystatus ${deploy.id}* to check status

> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      const raw = err.response?.data;
      const errMsg = (typeof raw === 'object' ? raw?.message || raw?.error : raw) || err.message;
      const isScope = String(errMsg).toLowerCase().includes('scope') || String(errMsg).toLowerCase().includes('write');
      await m.reply(
`❌ *Deployment Failed*
━━━━━━━━━━━━━━━━━━━━━

*Error:* ${errMsg}
${isScope ? `
⚠️ *API Key Permission Issue*
Your BERAHOST API key doesn't have *write* scope.

*How to fix:*
1. Go to your BERAHOST platform
2. Navigate to *API Keys* settings
3. Regenerate or create a new key with *write* scope enabled
4. Update the key in config.cjs as \`BERAHOST_KEY\`
` : ''}
> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── BERAHOST — Check Deployment Status ─────────────────────────────────
  if (['deploystatus', 'depstatus', 'checkdeploy', 'deplcheck'].includes(cmd)) {
    if (!q) return m.reply(`❌ *Usage:* ${p}deploystatus <deploymentId>\n\nExample: ${p}deploystatus 42\n\n> ${config.BOT_NAME}`);
    const deployId = q.trim();
    await m.React('🔍');

    try {
      const res = await axios.get(`${config.BERAHOST_API}/api/deployments/${deployId}`, {
        headers: { 'x-api-key': config.BERAHOST_KEY },
        timeout: 15000,
      });
      const d = res.data;

      const statusEmoji = {
        running: '🟢', active: '🟢', online: '🟢',
        starting: '🟡', pending: '🟡', building: '🟡',
        stopped: '🔴', error: '🔴', failed: '🔴', crashed: '🔴',
      };
      const emoji = statusEmoji[d.status?.toLowerCase()] || '⚪';

      await m.reply(
`🔍 *Deployment Status*
━━━━━━━━━━━━━━━━━━━━━

🆔 *ID:* ${d.id}
🤖 *Bot:* ${d.botId || d.bot?.name || 'N/A'}
${emoji} *Status:* ${d.status || 'unknown'}
🌐 *URL:* ${d.url || 'Not assigned'}
🕐 *Started:* ${d.createdAt ? new Date(d.createdAt).toLocaleString() : 'N/A'}
🔄 *Updated:* ${d.updatedAt ? new Date(d.updatedAt).toLocaleString() : 'N/A'}
${d.logs ? `\n📋 *Last Log:*\n\`\`\`\n${String(d.logs).slice(-300)}\n\`\`\`` : ''}
━━━━━━━━━━━━━━━━━━━━━

> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      const errMsg = err.response?.data?.message || err.response?.data?.error || err.message;
      await m.reply(`❌ *Status Check Failed*\n\n${errMsg}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── BERAHOST — List My Deployments ─────────────────────────────────────
  if (['mydeployments', 'deployments', 'mydeploys', 'listdeploys'].includes(cmd)) {
    await m.React('📋');
    try {
      const res = await axios.get(`${config.BERAHOST_API}/api/deployments`, {
        headers: { 'x-api-key': config.BERAHOST_KEY },
        timeout: 15000,
      });
      const deploys = res.data;
      if (!Array.isArray(deploys) || !deploys.length) {
        await m.reply(`📋 *No deployments found*\n\nUse *${p}deploy <botId> <SESSION_ID>* to deploy your first bot.\n\n> ${config.BOT_NAME}`);
        await m.React('ℹ️');
        return;
      }

      const statusEmoji = {
        running: '🟢', active: '🟢', online: '🟢',
        starting: '🟡', pending: '🟡', building: '🟡',
        stopped: '🔴', error: '🔴', failed: '🔴', crashed: '🔴',
      };

      const list = deploys.slice(0, 10).map((d, i) => {
        const emoji = statusEmoji[d.status?.toLowerCase()] || '⚪';
        return `*${i + 1}.* ID: ${d.id} | Bot: ${d.botId || 'N/A'}\n   ${emoji} ${d.status || 'unknown'} | ${d.url || 'No URL'}`;
      }).join('\n\n');

      await m.reply(
`📋 *My BERAHOST Deployments*
━━━━━━━━━━━━━━━━━━━━━

${list}
${deploys.length > 10 ? `\n_...and ${deploys.length - 10} more_` : ''}
━━━━━━━━━━━━━━━━━━━━━
💡 Use *${p}deploystatus <id>* for full details

> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      const errMsg = err.response?.data?.message || err.response?.data?.error || err.message;
      await m.reply(`❌ *Failed to list deployments*\n\n${errMsg}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }
};

export default techPlugin;
