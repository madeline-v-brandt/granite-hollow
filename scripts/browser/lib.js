// Shared helpers for the browser tests (headless Chrome through puppeteer-core).
// Needs: Chrome installed, `npm install puppeteer-core` somewhere Node can find it
// (or PUPPETEER=/path/to/puppeteer-core), and site/ served at 127.0.0.1:8765
// (e.g. `python3 -m http.server 8765 -d site`).
const puppeteer = require(process.env.PUPPETEER || "puppeteer-core");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BASE = process.env.GAME_URL || "http://127.0.0.1:8765/game/index.html";
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
async function open(query = "") {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
  const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 });
  const errs = [];
  p.on("pageerror", e => errs.push("pageerror: " + e.message));
  p.on("console", m => { if (m.type() === "error" && !/404|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  return { b, p, errs, url: BASE + query };
}
const ready = p => p.waitForFunction("(document.querySelector('#map .far') && window.__tilesPending === 0) || !document.querySelector('#creator').hidden", { timeout: 90000 });
async function click(p, sel) { return p.evaluate(s => { const b = document.querySelector(s); if (!b || b.disabled) return false; b.click(); return true; }, sel); }
// Close a level-up modal if one is open; returns true if the day summary is showing.
async function settle(p) {
  await sleep(150);
  return p.evaluate(() => {
    const keep = document.querySelector(".modal [data-close]"); if (keep) keep.click();
    return !!document.querySelector(".modal [data-next]");
  });
}
const GAME_DIR = require("path").join(__dirname, "..", "..", "site", "game") + "/";
const FIX = require("path").join(__dirname, "fixtures") + "/";
module.exports = { open, ready, click, settle, sleep, BASE, GAME_DIR, FIX };
