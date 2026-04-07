const fs = require("fs");
const path = require("path");
require("dotenv").config();

// ─── Runtime state (persisted to state.json) ──────────────────────────────────
const STATE_FILE = path.join(__dirname, "state.json");
let _state = {};
try { _state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch {}

const config = {
  SESSION_ID:        process.env.SESSION_ID || "Gifted~dYgTYi0RT3ge",
  PREFIX:            _state.PREFIX || process.env.PREFIX || ".",
  BOT_NAME:          _state.BOT_NAME || process.env.BOT_NAME || "ℂ𝕃𝕆𝕌𝔻 𝔸𝕀",
  OWNER_NAME:        process.env.OWNER_NAME || "𝔹ℝ𝕌ℂ𝔼 𝔹𝔼ℝ𝔸",
  OWNER_NUMBER:      process.env.OWNER_NUMBER || "254743982206",
  DESCRIPTION:       process.env.DESCRIPTION || "© 𝔹ℝ𝕌ℂ𝔼 𝔹𝔼ℝ𝔸",
  MENU_IMAGE:        process.env.MENU_IMAGE || "https://files.catbox.moe/7l1tt5.jpg",
  MODE:              _state.MODE || process.env.MODE || "public",
  VERSION:           "3.2.0",
  TIMEZONE:          "Africa/Nairobi",
  BERAHOST_API:      "https://bot-deployment-platform.replit.app",
  BERAHOST_KEY:      "bh_fff4fe54c28760d78f587eca840f9d29ffc707eba0c9e3d1",

  // ── Status automation ──
  AUTO_STATUS_SEEN:    process.env.AUTO_STATUS_SEEN  !== undefined ? process.env.AUTO_STATUS_SEEN  === "true" : true,
  AUTO_STATUS_REACT:   process.env.AUTO_STATUS_REACT !== undefined ? process.env.AUTO_STATUS_REACT === "true" : true,
  AUTO_STATUS_REPLY:   process.env.AUTO_STATUS_REPLY !== undefined ? process.env.AUTO_STATUS_REPLY === "false" : false,
  STATUS_READ_MSG:     process.env.STATUS_READ_MSG || "✅ Status seen by CLOUD AI",

  // ── Message automation ──
  AUTO_DL:             process.env.AUTO_DL        !== undefined ? process.env.AUTO_DL        === "true" : false,
  AUTO_READ:           _state.AUTO_READ !== undefined ? _state.AUTO_READ : (process.env.AUTO_READ !== undefined ? process.env.AUTO_READ === "true" : false),
  AUTO_TYPING:         process.env.AUTO_TYPING    !== undefined ? process.env.AUTO_TYPING    === "true" : true,
  AUTO_RECORDING:      process.env.AUTO_RECORDING !== undefined ? process.env.AUTO_RECORDING === "true" : false,
  ALWAYS_ONLINE:       _state.ALWAYS_ONLINE !== undefined ? _state.ALWAYS_ONLINE : (process.env.ALWAYS_ONLINE !== undefined ? process.env.ALWAYS_ONLINE === "true" : true),
  AUTO_REACT:          process.env.AUTO_REACT     !== undefined ? process.env.AUTO_REACT     === "true" : false,

  // ── Security ──
  AUTO_BLOCK:          process.env.AUTO_BLOCK     !== undefined ? process.env.AUTO_BLOCK     === "true" : true,
  ANTI_DELETE:         process.env.ANTI_DELETE    !== undefined ? process.env.ANTI_DELETE    === "true" : true,
  DELETE_PATH:         process.env.DELETE_PATH || "pm",
  REJECT_CALL:         process.env.REJECT_CALL   !== undefined ? process.env.REJECT_CALL   === "true" : false,
  NOT_ALLOW:           process.env.NOT_ALLOW      !== undefined ? process.env.NOT_ALLOW      === "true" : true,

  // ── Legacy API (deprecated — Pollinations.ai used instead) ──
  GIFTED_API_KEY:      process.env.GIFTED_API_KEY || "gifted",
  GIFTED_API:          process.env.GIFTED_API || "https://api.giftedtech.co.ke/api",
};

// ─── Persist state helper ────────────────────────────────────────────────────
config.setState = function(key, value) {
  _state[key] = value;
  config[key] = value;
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(_state, null, 2)); } catch {}
};

module.exports = config;
