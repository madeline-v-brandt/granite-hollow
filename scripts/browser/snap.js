// Render every screen from a fixed save (a v1 climber, mid-day on day 4) and
// record its text, so the game can be compared before and after a change:
//   node scripts/browser/snap.js after.json
// then compare with fixtures/screens-before-stage0.json (log comments are
// randomly worded, so a problem page's comments can differ).
const { open, ready, click, sleep, FIX } = require("./lib");
const fs = require("fs");
const [out, query = "", slot = "granite-hollow-save-v1", fixFile = FIX + "v1-midday.json"] = process.argv.slice(2);
const text = p => p.evaluate(() => document.querySelector("#tabbody").innerText.replace(/[ \t]+/g, " ").trim());
(async () => {
  const fix = JSON.parse(fs.readFileSync(fixFile, "utf8"));
  const { b, p, errs, url } = await open(query);
  const res = {};
  const variants = { atBoulder: fix.loc, atSector: { sector: fix.loc.sector, boulder: null }, atLot: { sector: null, boulder: null } };
  for (const [vn, loc] of Object.entries(variants)) {
    const g = { ...fix, loc };
    await p.goto(url); await p.evaluate((s, k) => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem(k, s); }, JSON.stringify(g), slot);
    await p.goto(url, { waitUntil: "load" }); await ready(p); await sleep(300);
    res[vn + ".here"] = await text(p);
    res[vn + ".hud"] = await p.evaluate(() => document.querySelector("#hud").innerText.replace(/\d{1,2}:\d\d [AP]M|\d+ min of light left|\d+ h \d+ min of light left/g, "#").replace(/\s+/g, " "));
    if (vn !== "atBoulder") continue;
    for (const tab of ["climber", "logbook", "journal", "craglog"]) { await click(p, `#tabs [data-tab="${tab}"]`); await sleep(150); res[tab] = await text(p); }
    await p.evaluate(() => { const s = document.querySelector("#cl-sort"); s.value = "stars"; s.dispatchEvent(new Event("change")); }); await sleep(100);
    res["craglog.stars"] = await text(p);
    await click(p, "[data-cl]"); await sleep(100); res["craglog.problem"] = await text(p);
    await click(p, "[data-cl-back]"); await sleep(100);
    await click(p, '[data-cl-view="rankings"]'); await sleep(100); res["craglog.rankings"] = await text(p);
    await click(p, '[data-cl-view="leaders"]'); await sleep(100); res["craglog.leaders"] = await text(p);
    // The map: labels, accessible names, and the hover card of the boulders on screen.
    res.mapLabels = await p.evaluate(() => [...document.querySelectorAll("#map g.lab")].map(g => g.textContent).join(" | "));
    res.aria = await p.evaluate(() => [...document.querySelectorAll("#map g.boulder")].map(g => g.getAttribute("aria-label")).sort().join(" | "));
    res.tips = await p.evaluate(() => {
      const out = [];
      for (const g of [...document.querySelectorAll("#map g.boulder")].filter(g => !g.closest("[display=none]")).slice(0, 6)) {
        const r = g.getBoundingClientRect();
        g.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
        const t = document.querySelector("#tip"); out.push(g.getAttribute("aria-label") + " => " + (t.hidden ? "(hidden)" : t.innerText.replace(/\s+/g, " ")));
      }
      return out;
    });
  }
  res.errors = errs;
  fs.writeFileSync(out, JSON.stringify(res, null, 1));
  console.log("wrote", out, Object.keys(res).length, "views; errors:", errs.length ? errs : "none");
  await b.close();
})();
