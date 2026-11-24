// Play three days of the game under the old rules to make a realistic v1 save
// (mid-day on day 4):   node scripts/browser/mkfix.js out.json
const { open, ready, click, settle, sleep } = require("./lib");
const fs = require("fs");
(async () => {
  const { b, p, errs, url } = await open();
  await p.goto(url); await p.evaluate(() => localStorage.clear()); await p.goto(url, { waitUntil: "load" });
  await p.waitForSelector("[data-str]");
  await p.evaluate(() => { document.querySelector("#cc-name").value = "Fixture"; document.querySelector("#cc-name").dispatchEvent(new Event("input")); const s = () => document.querySelectorAll("[data-str]"); s()[0].click(); s()[9].click(); document.querySelector("#cc-go").click(); });
  await ready(p);
  const plan = [["The Tailgate", 14], ["The Schoolhouse", 12], ["The Tailgate", 5]];
  for (let day = 0; day < plan.length; day++) {
    const [sector, tries] = plan[day];
    // Rained out? take the summary's first plan and carry on.
    if (await p.evaluate(() => !!document.querySelector(".modal [data-next]"))) { await click(p, ".modal [data-next]"); await sleep(600); }
    await click(p, `[data-go-sector="${sector}"]`); await sleep(2200);
    for (let bi = 0; bi < 2; bi++) {
      const ok = await p.evaluate(k => { const bs = document.querySelectorAll("[data-go-boulder]"); if (!bs[k]) return false; bs[k].click(); return true; }, bi);
      if (!ok) break; await sleep(1600);
      for (let i = 0; i < tries; i++) {
        const ok2 = await p.evaluate(k => { const ts = [...document.querySelectorAll("[data-try]:not([disabled])")]; if (!ts.length) return false; ts[k % ts.length].click(); return true; }, i);
        if (!ok2) break; await sleep(120);
        if (await settle(p)) break;
      }
      if (await p.evaluate(() => !!document.querySelector(".modal [data-next]"))) break;
    }
    if (day < plan.length - 1) {
      if (!(await p.evaluate(() => !!document.querySelector(".modal [data-next]")))) { await click(p, "#act-home"); await sleep(400); await settle(p); }
      await click(p, ".modal [data-next]"); await sleep(800);
    }
  }
  const save = await p.evaluate(() => localStorage.getItem("granite-hollow-save-v1"));
  fs.writeFileSync(process.argv[2] || "v1-save.json", save);
  const g = JSON.parse(save);
  console.log("day", g.dayNo, g.date, "loc", JSON.stringify(g.loc), "ticks", g.ticks.length, "tried", Object.keys(g.ps).length, "visited", g.visited, "tips", g.tips.length, "over", g.day.over, "errors", errs);
  await b.close();
})();
