// Granite Hollow: dialogue portraits (Phase 4, Stage 2). Pure functions that
// return SVG markup, so they work in the page and in Node (scripts/test_talk.js).
//
//   Portraits.svg(key, mood, { look, seed })   key: "gus", "rowan", …, "pickles", or
//                                              "stranger" (looks from seed)
//   Portraits.MOODS   neutral, happy, excited, thoughtful, frustrated, embarrassed
//                     (Pickles also has sleepy; Rowan also has smitten, shy and laugh,
//                     Stage 6, which anyone else draws as happy, embarrassed and happy)
//   Portraits.LOOKS   each regular's colours and clothes (the map's figures use these too)
//
// The look: inked like the map (warm dark lines, flat watercolour fills, a paper
// card behind). A head and shoulders, front on, in a 120 × 120 box. Each regular
// has their own face, hair, hat and one or two things that are theirs (Gus's
// moustache, Hollis's glasses, Rowan's pencil, Dez's earring, the Bishop's beard).
(function (root) {
  "use strict";
  const INK = "#3b3226";
  const LOOKS = {
    gus: { shirt: "#5f6b2d", pants: "#4a4031", hat: "cap", hatC: "#5f6b2d", skin: "#d1a27c", hair: "#9a958c", pad: null, longSleeves: true },
    bishop: { shirt: "#9b3b2f", stripes: "rgba(30,20,15,.35)", pants: "#4b4a52", hat: null, skin: "#e2b996", hair: "#e6e2da", pad: null, longSleeves: true },
    rowan: { shirt: "#e0b04a", pants: "#3c4a5c", hat: null, skin: "#a8734f", hair: "#2b1d16", pad: "#5a7d5a", chalk: "#e3dccb" },
    hollis: { shirt: "#5f7fa6", pants: "#6b6457", hat: "bucket", hatC: "#8a7a55", skin: "#f0c9a6", hair: "#7a5a3a", pad: "#c9772b", chalk: "#2f6b4f" },
    otis: { shirt: "#c46a3a", pants: "#2e3440", hat: "headband", hatC: "#d0a23a", skin: "#7a5038", hair: "#1e1a18", pad: "#2e4f6e", chalk: "#b5462e" },
    bea: { shirt: "#b0436e", stripes: "rgba(255,255,255,.4)", pants: "#2e3440", shorts: true, hat: null, skin: "#c08a64", hair: "#3a2418", pad: "#3f7fa6", chalk: "#d0a23a" },
    dez: { shirt: "#3b3f46", pants: "#5b4a3a", hat: "beanie", hatC: "#6d5aa8", skin: "#5e3b2a", hair: "#151210", pad: "#a43b2f", chalk: "#e3dccb" },
  };
  // Who has which face: hair style, head width, the card's wash, and what's theirs.
  const FACES = {
    gus: { hair: "temples", wide: 1.06, wash: "#d9dcb8", extras: ["moustache", "badge"], age: 1 },
    bishop: { hair: "tufts", wide: 0.98, wash: "#e6cfc2", extras: ["beard", "bushy"], age: 2 },
    rowan: { hair: "tousled", wide: 0.96, wash: "#efdcae", extras: ["pencil"] },
    hollis: { hair: "temples", wide: 1, wash: "#d3dce6", extras: ["glasses", "collar"] },
    otis: { hair: "crop", wide: 1.08, wash: "#ecd0bd", extras: ["stubble"] },
    bea: { hair: "ponytail", wide: 0.94, wash: "#efd0dc", extras: ["clip"], young: true },
    dez: { hair: "temples", wide: 1, wash: "#d9d4e6", extras: ["earring"] },
  };
  const MOODS = ["neutral", "happy", "excited", "thoughtful", "frustrated", "embarrassed"];
  const SWEET = ["smitten", "shy", "laugh"];                       // Rowan's own (Stage 6)
  const SWEET_AS = { smitten: "happy", shy: "embarrassed", laugh: "happy" };
  const f = v => Math.round(v * 10) / 10;
  const shade = (hex, k) => {                     // darker (k < 0) or lighter (k > 0)
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return hex;
    const n = parseInt(m[1], 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k))));
    return "#" + c.map(v => v.toString(16).padStart(2, "0")).join("");
  };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const P = (d, fill, extra = "") => `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round" ${extra}/>`;
  const L = (d, w = 1.4, extra = "") => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;

  // ---- the face's moving parts, by mood. Eyes at x 52 and 68, y 60.
  function eyes(mood) {
    const dot = (x, y, rx = 1.8, ry = 2.3) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${INK}"/>`;
    const glint = (x, y) => `<circle cx="${x + .6}" cy="${y - .8}" r=".6" fill="#fff"/>`;
    switch (mood) {
      case "happy": return L("M49,61 Q52,57.4 55,61") + L("M65,61 Q68,57.4 71,61");
      case "excited": return dot(52, 60, 2.3, 3) + dot(68, 60, 2.3, 3) + glint(52, 60) + glint(68, 60);
      case "thoughtful": return dot(53.3, 59, 1.7, 2.2) + dot(69.3, 59, 1.7, 2.2);
      case "frustrated": return dot(52, 61, 1.7, 1.6) + dot(68, 61, 1.7, 1.6) + L("M49,59.4 L55,59.8", 1.3) + L("M65,59.8 L71,59.4", 1.3);
      case "embarrassed": return L("M49,59.5 Q52,62.6 55,59.5") + L("M65,59.5 Q68,62.6 71,59.5");
      case "sleepy": return L("M49,61 Q52,62.5 55,61") + L("M65,61 Q68,62.5 71,61");
      // Rowan's: soft and a little heavy-lidded; looking down and away; laughing, eyes shut.
      case "smitten": return dot(52, 60.4, 2.2, 2.6) + dot(68, 60.4, 2.2, 2.6) + `<circle cx="52.8" cy="59.3" r=".9" fill="#fff"/><circle cx="68.8" cy="59.3" r=".9" fill="#fff"/><circle cx="51.3" cy="61.5" r=".45" fill="#fff"/><circle cx="67.3" cy="61.5" r=".45" fill="#fff"/>`;
      case "shy": return dot(50.2, 61.6, 1.7, 2) + dot(66.2, 61.6, 1.7, 2);
      case "laugh": return L("M48.6,60.6 Q52,56.6 55.4,60.6", 1.6) + L("M64.6,60.6 Q68,56.6 71.4,60.6", 1.6);
      default: return dot(52, 60) + dot(68, 60);
    }
  }
  function brows(mood, bushy, color) {
    const w = bushy ? 3.2 : 1.5, c = bushy ? color : INK;
    const b = (a, z) => `<path d="${a}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>` + `<path d="${z}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
    switch (mood) {
      case "happy": return b("M48,52.5 Q52,50.6 56,52.3", "M64,52.3 Q68,50.6 72,52.5");
      case "excited": return b("M48,50.5 Q52,47.6 56,50", "M64,50 Q68,47.6 72,50.5");
      case "thoughtful": return b("M48,53.4 Q52,52.4 56,53.2", "M64,51 Q68,48.4 72,50.6");
      case "frustrated": return b("M48,51.4 L56,54.6", "M64,54.6 L72,51.4");
      case "embarrassed": return b("M48,54.4 L56,51.8", "M64,51.8 L72,54.4");
      case "sleepy": return b("M48,54 Q52,53.4 56,54", "M64,54 Q68,53.4 72,54");
      case "smitten": return b("M48,52.6 Q52,50.2 56,52", "M64,52 Q68,50.2 72,52.6");
      case "shy": return b("M48,53.6 Q52,51 56,51.8", "M64,51.8 Q68,51 72,53.6");
      case "laugh": return b("M48,51.6 Q52,49 56,51.2", "M64,51.2 Q68,49 72,51.6");
      default: return b("M48,53.5 Q52,52 56,53.5", "M64,53.5 Q68,52 72,53.5");
    }
  }
  function mouth(mood) {
    switch (mood) {
      case "happy": return L("M53,70 Q60,76.5 67,70", 1.5);
      case "excited": return P("M53,69 Q60,80 67,69 Q60,71 53,69 Z", "#7a3b32") + `<path d="M56.5,74.6 Q60,72.8 63.5,74.6 Q60,77.2 56.5,74.6 Z" fill="#c76b6b"/>`;
      case "thoughtful": return L("M56,72.3 Q60,71.2 64.5,72.8", 1.4);
      case "frustrated": return L("M54,72.6 Q57,70.4 60,72.4 Q63,74.4 66,72.2", 1.4);
      case "embarrassed": return L("M56,71.2 Q60,74 64,71.2", 1.4);
      case "sleepy": return L("M57,71.8 Q60,72.6 63,71.8", 1.3);
      case "smitten": return L("M54.6,70.6 Q60,75 65.4,70.6", 1.5);
      case "shy": return L("M56.6,71.6 Q59,73.6 62.4,72.4", 1.4);
      case "laugh": return P("M52.6,68.6 Q60,81 67.4,68.6 Q60,70.6 52.6,68.6 Z", "#7a3b32") + `<path d="M56,74.2 Q60,72.2 64,74.2 Q60,77.6 56,74.2 Z" fill="#c76b6b"/>`;
      default: return L("M55,71 Q60,72.8 65,71", 1.4);
    }
  }
  const blush = mood => {
    const o = mood === "smitten" || mood === "shy" ? .62 : mood === "embarrassed" ? .5 : mood === "happy" || mood === "excited" || mood === "laugh" ? .28 : 0;
    return o ? `<ellipse cx="46.5" cy="66" rx="4.2" ry="2.4" fill="#d9665a" fill-opacity="${o}"/><ellipse cx="73.5" cy="66" rx="4.2" ry="2.4" fill="#d9665a" fill-opacity="${o}"/>` : "";
  };
  // A little pink heart by Rowan's cheek when smitten (understated: one, small).
  const heart = mood => (mood === "smitten" ? `<path d="M89,40 C89,36.6 93.6,36.2 94.2,39.4 C94.8,36.2 99.4,36.6 99.4,40 C99.4,43.4 94.2,46.6 94.2,46.6 C94.2,46.6 89,43.4 89,40 Z" fill="#e7849a" stroke="${INK}" stroke-width="1"/>` : "");
  const sweat = mood => (mood === "embarrassed" || mood === "frustrated" ? P("M83,46 Q86,51 83.6,53 Q80.6,52 83,46 Z", "#cfe3ef", `stroke-width="1"`) : "");

  // ---- hair, hats and what's theirs. The head: centre (60, 58), 20 × 23.
  function hairBack(style, c) {
    if (style === "tousled") return P("M39,72 C34,52 38,31 60,30 C82,31 86,52 81,72 C79,62 78,55 77,50 L43,50 C42,55 41,62 39,72 Z", c);
    if (style === "ponytail") return P("M70,37 C82,26 98,32 93,52 C91,58 88,62 85,64 C87,54 85,45 76,43 Z", c);
    return "";
  }
  function hairFront(style, c, look) {
    switch (style) {
      case "crop": return P("M40,55 C38,39 46,32 60,32 C74,32 82,39 80,55 C78,46 72,42 60,42 C48,42 42,46 40,55 Z", c);
      case "tousled": return P("M40,53 C39,37 49,30.5 60,30.5 C72,30.5 82,37 80,53 C77,45 72,41 66,45 C64,40 57,39.5 53,44 C49,41 43,45 40,53 Z", c);
      case "ponytail": return P("M40,55 C38,38 48,32 60,32 C72,32 82,38 80,55 C76,45 67,40 57,42 C51,43.5 44,48 40,55 Z", c);
      case "tufts": return P("M40.5,64 C36,55 37,46 43,42 C42,50 43,57 44.5,63 Z", c) + P("M79.5,64 C84,55 83,46 77,42 C78,50 77,57 75.5,63 Z", c)
        + L("M53,37 Q56,33.6 58,36.4 M61,36.2 Q64,32.8 66.4,36.6", 1.1);
      case "temples": default: return P("M40.6,49 C40,54 40.6,58.6 42.4,62 C43.2,57.6 43.6,53 44,49 Z", c) + P("M79.4,49 C80,54 79.4,58.6 77.6,62 C76.8,57.6 76.4,53 76,49 Z", c)
        + (look.hat ? "" : P("M41,52 C40,38 49,33 60,33 C71,33 80,38 79,52 C75,45 68,42 60,42 C52,42 45,45 41,52 Z", c));
    }
  }
  function hat(kind, c) {
    switch (kind) {
      case "cap": return P("M39,48 C38,30 82,30 81,48 Z", c) + P("M35,48.5 C47,53.6 73,53.6 85,48.5 C82,55 38,55 35,48.5 Z", shade(c, -.25))
        + `<circle cx="60" cy="41" r="3.2" fill="#e3c76a" stroke="${INK}" stroke-width="1"/>`;
      case "bucket": return P("M42.5,45 C42,31 78,31 77.5,45 Z", c) + P("M33.5,48 C40,42.5 80,42.5 86.5,48 C83,52.5 37,52.5 33.5,48 Z", shade(c, -.15)) + L("M43,44.2 Q60,41.6 77,44.2", 1);
      case "headband": return P("M40,48.6 C46,44.4 74,44.4 80,48.6 L80.4,53.2 C74,49 46,49 39.6,53.2 Z", c);
      case "beanie": return P("M39,50 C37.5,30 82.5,30 81,50 Z", c) + P("M38.6,47 C46,43.6 74,43.6 81.4,47 L81.6,53 C74,49.4 46,49.4 38.4,53 Z", shade(c, -.2))
        + L("M47,37 L46.4,46 M53,34.4 L52.6,45 M60,33.6 L60,44.6 M67,34.4 L67.4,45 M73,37 L73.6,46", .8, `stroke-opacity=".5"`);
      default: return "";
    }
  }
  function extras(list, look, mood) {
    let out = "";
    for (const x of list) {
      if (x === "moustache") out += P("M50.5,69.4 C54,65.4 58.2,66 60,68 C61.8,66 66,65.4 69.5,69.4 C66,71.3 62,70.4 60,69.2 C58,70.4 54,71.3 50.5,69.4 Z", shade(look.hair, -.1));
      if (x === "beard") out += P("M41.5,63 C39,86 52,95 60,95 C68,95 81,86 78.5,63 C75,71 70,74.4 65,73.4 C63,75.6 57,75.6 55,73.4 C50,74.4 45,71 41.5,63 Z", look.hair);
      if (x === "glasses") out += `<g fill="#fff" fill-opacity=".18" stroke="${INK}" stroke-width="1.3"><circle cx="52" cy="60" r="5.6"/><circle cx="68" cy="60" r="5.6"/></g>` + L("M57.6,59.4 Q60,58 62.4,59.4 M46.4,59 L40.6,57.6 M73.6,59 L79.4,57.6", 1.2);
      if (x === "pencil") out += `<g transform="rotate(28 82 46)">${P("M80.6,34 L83.4,34 L83.4,55 L82,58.4 L80.6,55 Z", "#e8c25a", `stroke-width="1"`)}${P("M80.6,34 L83.4,34 L83.4,31 Q82,29.6 80.6,31 Z", "#d98b9a", `stroke-width="1"`)}</g>`;
      if (x === "earring") out += `<circle cx="80.6" cy="66.4" r="2" fill="none" stroke="#d6b04a" stroke-width="1.4"/>`;
      if (x === "clip") out += P("M45,45.4 L52,42 L53,44.4 L46,47.6 Z", "#7fc1d6", `stroke-width="1"`);
      if (x === "stubble" && mood !== "excited") out += `<path d="M47,72 C49,80 55,82.6 60,82.6 C65,82.6 71,80 73,72" fill="none" stroke="${INK}" stroke-opacity=".22" stroke-width="5" stroke-linecap="round"/>`;
    }
    return out;
  }
  function body(look, face) {
    const sh = look.shirt || "#6b7a8f";
    let out = P("M16,121 C18,101 33,92.5 60,92.5 C87,92.5 102,101 104,121 Z", sh);
    if (look.stripes) out += `<clipPath id="pt-body"><path d="M16,121 C18,101 33,92.5 60,92.5 C87,92.5 102,101 104,121 Z"/></clipPath>`
      + `<g clip-path="url(#pt-body)" stroke="${look.stripes}" stroke-width="3.2"><path d="M10,106 H110 M10,114 H110 M10,99 H110"/></g>` + P("M16,121 C18,101 33,92.5 60,92.5 C87,92.5 102,101 104,121 Z", "none");
    if (face.extras.includes("collar")) out += P("M50,92.6 L60,101 L56,104 L46,95 Z", shade(sh, .18), `stroke-width="1"`) + P("M70,92.6 L60,101 L64,104 L74,95 Z", shade(sh, .18), `stroke-width="1"`);
    if (face.extras.includes("badge")) out += P("M80,103 l1.6,3.4 3.6,.4 -2.7,2.4 .8,3.6 -3.3,-1.9 -3.3,1.9 .8,-3.6 -2.7,-2.4 3.6,-.4 Z", "#e3c76a", `stroke-width="1"`);
    return out;
  }
  // A climber you haven't got to know: a look drawn from a seed (deterministic).
  function strangerLook(seed) {
    let h = 2166136261; for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    const r = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) / 4294967296);
    const pick = a => a[Math.floor(r() * a.length)];
    const look = { skin: pick(["#f0c9a6", "#e2b996", "#d1a27c", "#c08a64", "#a8734f", "#7a5038", "#5e3b2a"]), hair: pick(["#2b1d16", "#151210", "#7a5a3a", "#b0803e", "#3a2418", "#8c3c22"]),
      shirt: pick(["#3f6f9a", "#7a8f4a", "#9b5a3c", "#5a4f7a", "#2f6b62", "#b3863a", "#7a3b52"]), hat: pick([null, null, null, "beanie", "cap"]), hatC: pick(["#3b4f6e", "#8a3b32", "#4f6b3a", "#6d5aa8"]) };
    return { look, face: { hair: pick(["crop", "tousled", "ponytail", "temples"]), wide: 0.95 + r() * 0.12, wash: "#e6dcc6", extras: [] } };
  }
  function person(key, mood, opts) {
    let look = (opts && opts.look) || LOOKS[key], face = FACES[key];
    if (!face) { const s = strangerLook((opts && opts.seed) || key); look = { ...s.look, ...((opts && opts.look) || {}) }; face = s.face; }
    if (face.hair === "ponytail" && look.hat) look = { ...look, hat: null };
    const skin = look.skin || "#e6bf98", hair = look.hair || "#4a3426", w = face.wide || 1;
    const sx = `transform="translate(60 58) scale(${f(w)} 1) translate(-60 -58)"`;
    return `<rect x="1" y="1" width="118" height="118" rx="12" fill="#f6ecd4"/>`
      + `<circle cx="60" cy="56" r="47" fill="${face.wash}" fill-opacity=".85"/>`
      + body(look, face)
      + P("M52,76 L52,93 C56,96.4 64,96.4 68,93 L68,76 Z", shade(skin, -.12))
      + `<g ${sx}>`
      + hairBack(face.hair, hair)
      + `<ellipse cx="39.6" cy="61" rx="3.6" ry="5" fill="${skin}" stroke="${INK}" stroke-width="1.2"/><ellipse cx="80.4" cy="61" rx="3.6" ry="5" fill="${skin}" stroke="${INK}" stroke-width="1.2"/>`
      + `<ellipse cx="60" cy="58" rx="20" ry="23" fill="${skin}" stroke="${INK}" stroke-width="1.3"/>`
      + (face.age ? L("M50,47.6 Q54,46.6 57,47.6 M63,47.6 Q66,46.6 70,47.6", .9, `stroke-opacity=".45"`) + L("M45,67 Q46.4,69 48.6,69.4 M75,67 Q73.6,69 71.4,69.4", .9, `stroke-opacity=".4"`) : "")
      + blush(mood)
      + hairFront(face.hair, hair, look)
      + hat(look.hat, look.hatC || "#6b5a45")
      + eyes(mood) + brows(mood, face.extras.includes("bushy"), shade(hair, -.05))
      + L("M60,61.5 Q57.8,65.8 60.6,66.4", 1.1)
      + (face.extras.includes("beard") ? extras(["beard"], { hair }, mood) : "")
      + mouth(mood)
      + extras(face.extras.filter(x => x !== "beard"), { ...look, hair }, mood)
      + `</g>` + sweat(mood) + heart(mood);
  }
  // Pickles: a scruffy grey dog with a pale muzzle and one floppy ear.
  function pickles(mood) {
    const fur = "#9c9a94", dark = "#6a6862", pale = "#e8e6e0";
    const tilt = mood === "thoughtful" ? 12 : mood === "embarrassed" ? -6 : 0;
    const ears = mood === "excited" ? P("M38,46 C30,30 36,22 44,30 C46,36 46,42 44,48 Z", dark) + P("M82,46 C90,30 84,22 76,30 C74,36 74,42 76,48 Z", dark)
      : P("M40,40 C28,40 24,58 30,70 C36,64 40,56 44,48 Z", dark) + P("M80,40 C92,40 96,58 90,70 C84,64 80,56 76,48 Z", dark);
    const e = { neutral: "dot", happy: "arc", excited: "big", thoughtful: "dot", frustrated: "sad", embarrassed: "side", sleepy: "shut" }[mood] || "dot";
    const eye = x => e === "arc" ? L(`M${x - 3},58 Q${x},54.6 ${x + 3},58`, 1.6) : e === "shut" ? L(`M${x - 3},58 Q${x},60 ${x + 3},58`, 1.6)
      : e === "big" ? `<circle cx="${x}" cy="57" r="3.4" fill="${INK}"/><circle cx="${x + 1}" cy="55.8" r="1" fill="#fff"/>`
      : e === "sad" ? `<circle cx="${x}" cy="58" r="2.6" fill="${INK}"/>` + L(`M${x - 4},${x < 60 ? 52 : 54} L${x + 4},${x < 60 ? 54 : 52}`, 1.4)
      : e === "side" ? `<circle cx="${x + 1.6}" cy="58.6" r="2.4" fill="${INK}"/>` : `<circle cx="${x}" cy="57.6" r="2.7" fill="${INK}"/><circle cx="${x + .8}" cy="56.6" r=".8" fill="#fff"/>`;
    const tongue = mood === "happy" || mood === "excited" ? P("M56,77 C56,86 64,86 64,77 Z", "#d77a82", `stroke-width="1.1"`) : "";
    const zz = mood === "sleepy" ? `<text x="84" y="34" font-family="Caveat, cursive" font-size="16" font-weight="700" fill="${INK}">z</text><text x="93" y="24" font-family="Caveat, cursive" font-size="12" font-weight="700" fill="${INK}">z</text>` : "";
    return `<rect x="1" y="1" width="118" height="118" rx="12" fill="#f6ecd4"/><circle cx="60" cy="56" r="47" fill="#dfe0cf" fill-opacity=".85"/>`
      // Shoulders and a neck that rises up behind his head, so he's all in one piece whichever way he tilts it.
      + P("M22,121 C24,104 34,95 45,91 C44,82 49,72 60,72 C71,72 76,82 75,91 C86,95 96,104 98,121 Z", fur) + P("M45,98 C51,106 69,106 75,98 L72,113 C66,117 54,117 48,113 Z", pale)
      + `<path d="M45,90 Q60,98 75,90" fill="none" stroke="#b5462e" stroke-width="3.4" stroke-linecap="round"/><circle cx="60" cy="96.6" r="2.6" fill="#e3c76a" stroke="${INK}" stroke-width="1"/>`
      + `<g transform="rotate(${tilt} 60 60)">${ears}`
      + P("M38,56 C36,34 50,28 60,28 C70,28 84,34 82,56 C82,72 74,84 60,84 C46,84 38,72 38,56 Z", fur)
      + P("M48,48 C44,40 49,33 56,34 C55,40 53,45 48,48 Z", pale, `stroke-width="1"`)
      + P("M46,70 C46,62 52,60 60,60 C68,60 74,62 74,70 C74,79 68,83 60,83 C52,83 46,79 46,70 Z", pale)
      + L("M48,40 l-2,-4 M52,37 l-1,-5 M68,37 l1,-5 M72,40 l2,-4", 1.1)
      + eye(51) + eye(69)
      + P("M55.4,66.4 C55.4,63.4 64.6,63.4 64.6,66.4 C64.6,69 61.4,70.4 60,70.4 C58.6,70.4 55.4,69 55.4,66.4 Z", "#2b2622")
      + L("M60,70.4 L60,74 M53,74 Q56.6,77.6 60,74 Q63.4,77.6 67,74", 1.3) + tongue + `</g>` + zz;
  }
  function svg(key, mood = "neutral", opts = {}) {
    const m = key === "pickles" ? (["sleepy", ...MOODS].includes(mood) ? mood : SWEET_AS[mood] || "neutral")
      : MOODS.includes(mood) || (key === "rowan" && SWEET.includes(mood)) ? mood : SWEET_AS[mood] || "neutral";
    const inner = key === "pickles" ? pickles(m) : person(key, m, opts);
    return `<svg class="portrait" viewBox="0 0 120 120" role="img" aria-label="${esc(opts.label || "")}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
  }
  const Portraits = { svg, MOODS, SWEET, LOOKS, FACES };
  if (typeof module !== "undefined") module.exports = Portraits; else root.Portraits = Portraits;
})(typeof window !== "undefined" ? window : globalThis);
