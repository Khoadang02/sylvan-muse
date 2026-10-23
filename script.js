/*
 * Sylvan Muse — a small gallery walked scene by scene.
 * Threshold → Entrance → Story → Hall (+ Question) → Farewell
 */
(() => {
  "use strict";

  const CONFIG = {
    // Notes are emailed here via FormSubmit (https://formsubmit.co). After activating,
    // you can swap the address for the random alias FormSubmit gives you.
    noteEmail: "tranhuuthuc02@gmail.com",
    // "Holocene" by Bon Iver — Apple Music's official 30-second preview (iTunes Search API),
    // credited with a link back to the full song on Apple Music.
    musicPreviewUrl:
      "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/8b/74/ba/8b74ba14-6488-29f2-bc71-29887b6cc1e5/mzaf_11920459242243046922.plus.aac.p.m4a",
    appleMusicUrl: "https://music.apple.com/us/album/holocene/482817464?i=482817470",
    musicVolume: 0.7,
    musicFadeSec: 6,
    questionDelayMs: 30000,
    // Typing sound: "keyboard" (soft, muted mechanical clicks)
    // or "terminal" (soft on-screen text blips, as in 80s–90s films).
    typingSound: "keyboard",
  };

  const T = window.TRANSLATIONS;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const isNarrow = window.matchMedia("(max-width: 860px)");

  const scenes = {
    threshold: $("#scene-threshold"),
    entrance: $("#scene-entrance"),
    story: $("#scene-story"),
    hall: $("#scene-hall"),
    farewell: $("#scene-farewell"),
  };

  const state = {
    lang: null,
    scene: "threshold",
    entered: true,
    timers: [],
    storyDone: false,
    typing: null,
    stanzaIndex: -1,
    stanzaTimer: null,
    answer: null,
    lastSkip: 0,
  };

  /* ---------- i18n ---------- */
  function t(path, lang = state.lang || "en") {
    return path.split(".").reduce((obj, key) => (obj == null ? obj : obj[key]), T[lang]);
  }

  function applyTranslations() {
    $$("[data-i18n]").forEach((el) => {
      const value = t(el.dataset.i18n, el.dataset.i18nLang || undefined);
      if (typeof value === "string") el.textContent = value;
    });
    $$("[data-i18n-attr]").forEach((el) => {
      el.dataset.i18nAttr.split(";").forEach((pair) => {
        const [attr, key] = pair.split(":").map((s) => s.trim());
        const value = t(key);
        if (typeof value === "string") el.setAttribute(attr, value);
      });
    });
    if (state.lang) {
      document.documentElement.lang = state.lang;
      document.title = t("meta.title");
    }
    $$("[data-typed]").forEach((el) => buildTyped(el, el.textContent));
    buildWallText();
    buildPoem();
    setupPlacard();
  }

  function buildWallText() {
    const list = $("#wall-text");
    list.replaceChildren(
      ...t("story.lines").map((line) => buildTyped(document.createElement("li"), line))
    );
  }

  function buildPoem() {
    const poem = $("#poem");
    poem.replaceChildren(
      ...t("poem").map((lines) => {
        const p = document.createElement("p");
        p.className = "stanza";
        return buildTyped(p, lines.join("\n"));
      })
    );
  }

  /* ---------- Typed text ---------- */
  const graphemes = (text) =>
    "Segmenter" in Intl
      ? Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text), (s) => s.segment)
      : Array.from(text);

  // Lay out every letter up front (invisible) so nothing reflows while typing.
  function buildTyped(el, text) {
    el.replaceChildren();
    text.normalize("NFC").split("\n").forEach((line, li) => {
      if (li > 0) el.appendChild(document.createElement("br"));
      line.split(/( +)/).forEach((part) => {
        if (!part) return;
        if (part.trim() === "") {
          const space = document.createElement("span");
          space.className = "ch";
          space.textContent = part;
          el.appendChild(space);
          return;
        }
        const word = document.createElement("span");
        word.className = "word";
        graphemes(part).forEach((g) => {
          const ch = document.createElement("span");
          ch.className = "ch";
          ch.textContent = g;
          word.appendChild(ch);
        });
        el.appendChild(word);
      });
    });
    return el;
  }

  // A slow, uneven, human tempo — like someone thinking between keys.
  function keyDelay(ch, speed, pause) {
    const base = speed * (0.55 + Math.random() * 1.05);
    if (/[.!?]/.test(ch)) return base + 650 * pause;
    if (ch === "…") return base + 950 * pause;
    if (/[,;:]/.test(ch)) return base + 380 * pause;
    if (ch.trim() === "") return base * 1.15;
    return base;
  }

  // Strike each letter like a key. Returns a job whose finish() reveals the rest at once.
  // At the natural end of a line, Enter is pressed.
  function type(el, { speed = 140, pause = 1, volume = 0.6, onDone } = {}) {
    const chars = $$(".ch", el);
    let i = 0;
    const job = { timer: 0, finish };
    state.typing = job;

    function end(callDone) {
      clearTimeout(job.timer);
      chars.forEach((c) => c.classList.add("on"));
      chars.forEach((c) => c.classList.remove("is-caret"));
      if (state.typing === job) state.typing = null;
      if (callDone && onDone) onDone();
    }
    function finish(callDone = true) {
      end(callDone);
    }
    function step() {
      if (i > 0) chars[i - 1].classList.remove("is-caret");
      if (i >= chars.length) {
        enterSound(volume);
        return end(true);
      }
      const c = chars[i++];
      c.classList.add("on", "is-caret");
      keySound(c.textContent, volume);
      job.timer = later(step, keyDelay(c.textContent, speed, pause));
    }

    if (reducedMotion.matches) end(true);
    else step();
    return job;
  }

  /* Typing sounds, synthesized with Web Audio — no audio files.
     Everything runs through a warm low-pass, a gentle compressor and a little room
     reverb, so the clicks sit softly in the space instead of poking at the ear. */
  const keys = { ctx: null, noise: null, out: null, bed: null, bedGain: null };

  function initKeySounds() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    // iOS 17+: play like media, so the ring/silent switch doesn't mute the gallery.
    if (navigator.audioSession) navigator.audioSession.type = "playback";
    if (!keys.ctx) {
      const ctx = (keys.ctx = new AC());
      const rate = ctx.sampleRate;

      keys.noise = ctx.createBuffer(1, Math.floor(rate * 0.5), rate);
      const d = keys.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

      keys.out = ctx.createGain();
      keys.out.gain.value = 0.32; // soft, but clearly there — never over the words
      const warm = ctx.createBiquadFilter();
      warm.type = "lowpass";
      warm.frequency.value = 3400;
      warm.Q.value = 0.5;
      const soften = ctx.createDynamicsCompressor();
      soften.threshold.value = -30;
      soften.knee.value = 20;
      soften.ratio.value = 4;
      soften.attack.value = 0.002;
      soften.release.value = 0.12;
      keys.out.connect(warm).connect(soften).connect(ctx.destination);

      // small wooden room: a short, dark, decaying reverb tail
      const room = ctx.createConvolver();
      const ir = ctx.createBuffer(2, Math.floor(rate * 0.9), rate);
      for (let c = 0; c < 2; c++) {
        const ch = ir.getChannelData(c);
        let lp = 0;
        for (let i = 0; i < ch.length; i++) {
          lp += 0.25 * ((Math.random() * 2 - 1) - lp);
          ch[i] = lp * Math.pow(1 - i / ch.length, 3);
        }
      }
      room.buffer = ir;
      const wet = ctx.createGain();
      wet.gain.value = 0.2;
      soften.connect(room).connect(wet).connect(ctx.destination);

      // wind through the trees under the welcome and story, faded in per scene:
      // soft brown noise, a slowly wandering band of whoosh, and gusts that swell and settle
      const bedBuf = ctx.createBuffer(1, Math.floor(rate * 6), rate);
      const b = bedBuf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < b.length; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        b[i] = last * 3.5;
      }
      keys.bed = ctx.createBufferSource();
      keys.bed.buffer = bedBuf;
      keys.bed.loop = true;
      const whoosh = ctx.createBiquadFilter();
      whoosh.type = "bandpass";
      whoosh.frequency.value = 520;
      whoosh.Q.value = 0.6;
      const drift = ctx.createOscillator();
      drift.frequency.value = 0.05;
      const driftDepth = ctx.createGain();
      driftDepth.gain.value = 220;
      drift.connect(driftDepth).connect(whoosh.frequency);
      const gusts = ctx.createGain();
      gusts.gain.value = 0.65;
      const gust = ctx.createOscillator();
      gust.frequency.value = 0.08;
      const gustDepth = ctx.createGain();
      gustDepth.gain.value = 0.35;
      gust.connect(gustDepth).connect(gusts.gain);
      keys.bedGain = ctx.createGain();
      keys.bedGain.gain.value = 0;
      keys.bed.connect(whoosh).connect(gusts).connect(keys.bedGain).connect(ctx.destination);
      keys.bed.start();
      drift.start();
      gust.start();
    }
    if (keys.ctx.state === "suspended") keys.ctx.resume();
  }

  function roomTone(on) {
    if (!keys.ctx) return;
    const g = keys.bedGain.gain;
    const t = keys.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(on && !music.muted ? 0.05 : 0, t + (on ? 3 : 4));
    clearTimeout(keys.rustleTimer);
    if (on) keys.rustleTimer = setTimeout(rustleLoop, 2500);
  }

  // a few dry leaves stirring somewhere nearby
  function rustleLoop() {
    if (soundOn(1)) {
      const t0 = keys.ctx.currentTime;
      const count = 6 + Math.floor(Math.random() * 8);
      const v = 0.05 + Math.random() * 0.05;
      for (let i = 0; i < count; i++) {
        const at = t0 + Math.random() * 0.45;
        noiseBurst(at, 0.012 + Math.random() * 0.02, { type: "highpass", freq: 2200 + Math.random() * 1600, gain: v * (0.4 + Math.random() * 0.6), attack: 0.003 });
      }
    }
    keys.rustleTimer = setTimeout(rustleLoop, 2500 + Math.random() * 3500);
  }

  // the doors open: a warm, slow chord that swells with the light
  function doorChime() {
    if (!soundOn(1)) return;
    const ctx = keys.ctx;
    const t0 = ctx.currentTime + 0.05;
    [[220, 0.035], [329.6, 0.028], [440, 0.022], [554.4, 0.018], [1318.5, 0.006]].forEach(([f, g], i) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 8;
      const env = ctx.createGain();
      const start = t0 + i * 0.09;
      env.gain.setValueAtTime(0.0001, start);
      env.gain.exponentialRampToValueAtTime(g, start + 0.9);
      env.gain.exponentialRampToValueAtTime(0.0001, start + 4.5);
      o.connect(env).connect(keys.out);
      o.start(start);
      o.stop(start + 4.6);
    });
  }

  function noiseBurst(t, dur, { type = "bandpass", freq = 3000, q = 1, gain = 0.2, attack = 0.004, rate = 1 }) {
    const ctx = keys.ctx;
    const src = ctx.createBufferSource();
    src.buffer = keys.noise;
    src.playbackRate.value = rate;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(keys.out);
    src.start(t, Math.random() * 0.4, dur + 0.02);
    return f;
  }

  function tone(t, freq, dur, gain, type = "sine", endFreq) {
    const ctx = keys.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(keys.out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  const soundOn = (volume) => keys.ctx && !music.muted && volume > 0;

  function keySound(ch, volume) {
    if (!soundOn(volume)) return;
    const t = keys.ctx.currentTime;
    const v = volume * (0.8 + Math.random() * 0.4);
    if (CONFIG.typingSound === "terminal") terminalKey(ch, t, v);
    else keyboardKey(ch, t, v);
  }

  function enterSound(volume) {
    if (!soundOn(volume)) return;
    const t = keys.ctx.currentTime + 0.25;
    if (CONFIG.typingSound === "terminal") terminalEnter(t, volume);
    else keyboardEnter(t, volume);
  }

  // Soft, muted mechanical keyboard: a rounded click and a low "thock",
  // then a quieter tick as the key comes back up. No bright pings.
  function keyboardKey(ch, t, v) {
    const space = ch.trim() === "";
    const pitch = space ? 0.7 : 0.9 + Math.random() * 0.25;
    noiseBurst(t, 0.02, { freq: 2300 * pitch, q: 1.3, gain: (space ? 0.2 : 0.32) * v, attack: 0.004 });
    tone(t + 0.004, (space ? 130 : 190) * pitch, 0.05, 0.1 * v, "sine", 110);
    noiseBurst(t + 0.006, 0.025, { type: "lowpass", freq: 800, gain: 0.07 * v, attack: 0.006 });
    const up = t + 0.09 + Math.random() * 0.04;
    noiseBurst(up, 0.014, { freq: 1900 * pitch, q: 1.4, gain: 0.1 * v, attack: 0.004 });
  }

  // end of a line: a slightly fuller press, like the wide Enter key
  function keyboardEnter(t, v) {
    noiseBurst(t, 0.028, { freq: 1900, q: 1.1, gain: 0.32 * v, attack: 0.005 });
    tone(t + 0.005, 150, 0.07, 0.13 * v, "sine", 90);
    noiseBurst(t + 0.006, 0.04, { type: "lowpass", freq: 600, gain: 0.14 * v, attack: 0.006 });
    noiseBurst(t + 0.14, 0.02, { freq: 1200, q: 1.2, gain: 0.08 * v, attack: 0.005 });
  }

  // Alternative: the movie computer — soft on-screen blips.
  function terminalKey(ch, t, v) {
    if (ch.trim() === "") return tone(t, 520, 0.02, 0.025 * v, "sine");
    const f = 1050 + Math.random() * 180;
    tone(t, f, 0.028, 0.09 * v, "triangle");
    tone(t, f / 2, 0.022, 0.035 * v, "sine");
  }

  function terminalEnter(t, v) {
    tone(t, 880, 0.06, 0.06 * v, "triangle");
    tone(t + 0.07, 1320, 0.09, 0.05 * v, "triangle");
  }

  // A camera shutter: first curtain, a breath, second curtain, and the mirror settling.
  function shutterSound() {
    if (!soundOn(1)) return;
    const t = keys.ctx.currentTime;
    noiseBurst(t, 0.03, { freq: 2600, q: 0.8, gain: 0.55, attack: 0.002 });
    tone(t, 230, 0.05, 0.28, "sine", 120);
    noiseBurst(t + 0.075, 0.04, { freq: 1900, q: 0.9, gain: 0.48, attack: 0.002 });
    tone(t + 0.075, 190, 0.06, 0.26, "sine", 100);
    noiseBurst(t + 0.08, 0.14, { type: "lowpass", freq: 900, gain: 0.12, attack: 0.004 });
  }

  function takeTheShot() {
    shutterSound();
    setStoryLight(0.75);
    if (reducedMotion.matches) return;
    const flash = $("#flash");
    flash.classList.remove("is-firing");
    flash.getBoundingClientRect();
    flash.classList.add("is-firing");
  }

  /* ---------- Welcome: autumn leaves on the wind ---------- */
  const LEAF_COLORS = ["#c9772f", "#a8521f", "#dcae63", "#8a5530", "#b8892e", "#7a4a22", "#d99a4e"];
  const fall = { canvas: $("#welcome-leaves"), ctx: null, leaves: [], raf: 0, last: 0, w: 0, h: 0, until: 0 };

  function leafPath(ctx, s) {
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.bezierCurveTo(s * 0.78, -s * 0.45, s * 0.58, s * 0.5, 0, s * 0.82);
    ctx.bezierCurveTo(-s * 0.58, s * 0.5, -s * 0.78, -s * 0.45, 0, -s);
    ctx.closePath();
  }

  function placeLeaf(l, anywhere) {
    if (anywhere) {
      l.x = Math.random() * fall.w;
      l.y = Math.random() * fall.h;
    } else if (Math.random() < 0.6) {
      l.x = Math.random() * fall.w * 0.9 - fall.w * 0.1;
      l.y = -30;
    } else {
      l.x = -30;
      l.y = Math.random() * fall.h * 0.7;
    }
    l.size = (6 + Math.random() * 7) * (0.55 + l.z);
    l.color = LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)];
    l.phase = Math.random() * Math.PI * 2;
    l.flutter = 1.2 + Math.random() * 1.8;
    l.rot = Math.random() * Math.PI * 2;
    l.spin = (Math.random() - 0.5) * 1.6;
    l.drift = (Math.random() - 0.5) * 14;
    return l;
  }

  function sizeFall() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    fall.w = fall.canvas.clientWidth || window.innerWidth;
    fall.h = fall.canvas.clientHeight || window.innerHeight;
    fall.canvas.width = fall.w * dpr;
    fall.canvas.height = fall.h * dpr;
    fall.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function startFall() {
    fall.ctx = fall.ctx || fall.canvas.getContext("2d");
    sizeFall();
    if (!fall.leaves.length) {
      const count = isNarrow.matches ? 26 : 46;
      fall.leaves = Array.from({ length: count }, () => placeLeaf({ z: 0.3 + Math.random() * 0.95 }, true))
        .sort((a, b) => a.z - b.z); // far leaves first, near ones on top
    }
    fall.until = 0;
    if (reducedMotion.matches) return drawFall(0);
    if (!fall.raf) {
      fall.last = performance.now();
      fall.raf = requestAnimationFrame(fallTick);
    }
  }

  function fallTick(now) {
    if (state.scene !== "entrance") {
      if (!fall.until) fall.until = now + 2200; // keep drifting while the scene fades out
      if (now > fall.until) {
        fall.raf = 0;
        fall.ctx.clearRect(0, 0, fall.w, fall.h);
        return;
      }
    }
    const dt = Math.min(0.05, (now - fall.last) / 1000);
    fall.last = now;
    const s = now / 1000;
    const wind = 18 + 26 * Math.sin(s * 0.35) + 12 * Math.sin(s * 1.3 + 1);
    for (const l of fall.leaves) {
      l.phase += dt * l.flutter;
      l.x += (wind * l.z + l.drift + Math.cos(l.phase) * 8) * dt;
      l.y += (14 + 24 * l.z + Math.sin(l.phase) * 10) * dt;
      l.rot += (l.spin + Math.sin(l.phase) * 0.6) * dt;
      if (l.y > fall.h + 30 || l.x > fall.w + 30) placeLeaf(l, false);
    }
    drawFall(s);
    fall.raf = requestAnimationFrame(fallTick);
  }

  function drawFall() {
    const { ctx, w, h } = fall;
    ctx.clearRect(0, 0, w, h);
    for (const l of fall.leaves) {
      ctx.save();
      ctx.translate(l.x, l.y);
      ctx.rotate(l.rot);
      ctx.scale(Math.cos(l.phase * 0.8) * 0.85 + 0.15 * Math.sign(Math.cos(l.phase * 0.8) || 1), 1); // the leaf turns over as it falls
      ctx.globalAlpha = 0.3 + 0.6 * Math.min(1, l.z);
      ctx.fillStyle = l.color;
      leafPath(ctx, l.size);
      ctx.fill();
      ctx.globalAlpha *= 0.5;
      ctx.strokeStyle = "rgba(255, 238, 205, 0.6)";
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(0, -l.size * 0.8);
      ctx.lineTo(0, l.size * 1.05);
      ctx.stroke();
      ctx.restore();
    }
  }

  /* ---------- The placard blows away (phones), leaving a way back ---------- */
  const LEAF_SVG = "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 2.5C17.5 7 17.8 14.5 12 20.5 6.2 14.5 6.5 7 12 2.5Z\" fill=\"currentColor\" opacity=\".9\"/><path d=\"M12 5v17\" stroke=\"#0d0b08\" stroke-opacity=\".35\" stroke-width=\"1\" fill=\"none\"/></svg>";

  function setupPlacard() {
    const card = $(".placard");
    if (isNarrow.matches) {
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", t("hall.hidePlacard"));
    } else {
      card.removeAttribute("tabindex");
      card.removeAttribute("role");
      card.setAttribute("aria-label", t("hall.placardLabel"));
    }
  }

  function whooshSound() {
    if (!soundOn(1)) return;
    const t0 = keys.ctx.currentTime;
    const f = noiseBurst(t0, 1.1, { type: "lowpass", freq: 400, q: 0.7, gain: 0.16, attack: 0.3 });
    f.frequency.setValueAtTime(400, t0);
    f.frequency.exponentialRampToValueAtTime(1800, t0 + 0.45);
    f.frequency.exponentialRampToValueAtTime(500, t0 + 1.1);
  }

  function burstLeaves(rect) {
    if (reducedMotion.matches) return;
    for (let i = 0; i < 18; i++) {
      const leaf = document.createElement("span");
      leaf.className = "burst-leaf";
      leaf.innerHTML = LEAF_SVG;
      leaf.style.color = LEAF_COLORS[i % LEAF_COLORS.length];
      const size = 9 + Math.random() * 9;
      leaf.style.width = leaf.style.height = `${size}px`;
      leaf.style.left = `${rect.left + Math.random() * rect.width}px`;
      leaf.style.top = `${rect.top + Math.random() * rect.height}px`;
      document.body.appendChild(leaf);
      const dx = 60 + Math.random() * 260;
      const dy = -(40 + Math.random() * 260);
      const spin = (Math.random() < 0.5 ? -1 : 1) * (180 + Math.random() * 540);
      leaf.animate(
        [
          { transform: "translate(0, 0) rotate(0deg) scale(0.4)", opacity: 0 },
          { transform: `translate(${dx * 0.25}px, ${dy * 0.35}px) rotate(${spin * 0.3}deg) scale(1)`, opacity: 1, offset: 0.18 },
          { transform: `translate(${dx}px, ${dy}px) rotate(${spin}deg) scale(0.85)`, opacity: 0 },
        ],
        { duration: 1500 + Math.random() * 1200, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)", delay: Math.random() * 180 }
      ).finished.then(() => leaf.remove());
    }
  }

  function blowPlacard() {
    const card = $(".placard");
    if (!isNarrow.matches || card.classList.contains("is-gone") || card.dataset.moving) return;
    card.dataset.moving = "1";
    whooshSound();
    burstLeaves(card.getBoundingClientRect());
    const gone = () => {
      card.classList.add("is-gone");
      delete card.dataset.moving;
      $("#placard-return").hidden = false;
    };
    if (reducedMotion.matches) return gone();
    card.getAnimations().forEach((a) => a.cancel());
    card.animate(
      [
        { transform: "none", opacity: 1, filter: "blur(0)" },
        { transform: "translate(8vw, -4vh) rotate(6deg)", opacity: 1, filter: "blur(0)", offset: 0.25 },
        { transform: "translate(60vw, -38vh) rotate(32deg) scale(0.5)", opacity: 0, filter: "blur(3px)" },
      ],
      { duration: 1150, easing: "cubic-bezier(0.55, 0, 0.75, 0.2)", fill: "forwards" }
    ).finished.then(gone);
  }

  function returnPlacard() {
    const card = $(".placard");
    $("#placard-return").hidden = true;
    card.getAnimations().forEach((a) => a.cancel());
    card.classList.remove("is-gone");
    if (reducedMotion.matches) return;
    card.animate(
      [
        { transform: "translate(-20vw, 6vh) rotate(-14deg) scale(0.7)", opacity: 0, filter: "blur(3px)" },
        { transform: "none", opacity: 1, filter: "blur(0)" },
      ],
      { duration: 1000, easing: "cubic-bezier(0.2, 0.8, 0.3, 1)" }
    );
  }

  // On phones the placard starts tucked away, so nothing covers the walker;
  // a small "Details" button offers it instead.
  function resetPlacard() {
    const card = $(".placard");
    card.getAnimations().forEach((a) => a.cancel());
    card.classList.toggle("is-gone", isNarrow.matches);
    delete card.dataset.moving;
    $("#placard-return").hidden = true;
  }

  function showPlacard() {
    const card = $(".placard");
    card.classList.add("is-shown");
    if (card.classList.contains("is-gone")) $("#placard-return").hidden = false;
  }

  /* ---------- Story: the light he saw ---------- */
  function paintGlow() {
    const art = $("#artwork img");
    const canvas = $("#story-glow");
    const draw = () => canvas.getContext("2d").drawImage(art, 0, 0, canvas.width, canvas.height);
    if (art.complete && art.naturalWidth) draw();
    else art.addEventListener("load", draw, { once: true });
  }

  function setStoryLight(level) {
    scenes.story.style.setProperty("--story-light", String(level));
  }

  /* ---------- Farewell keepsakes ---------- */
  const visitedAt = { date: null };

  function wrapLines(ctx, text, maxWidth) {
    const words = text.split(" ");
    const lines = [];
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = w;
      } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  async function makeTicket() {
    const W = 1080, H = 1680;
    await Promise.all([
      document.fonts.load('600 80px "Dancing Script"', "Nơi thơ nở"),
      document.fonts.load('400 30px "Be Vietnam Pro"', "Vé"),
      document.fonts.load('500 30px "Be Vietnam Pro"', "Vé"),
    ]).catch(() => {});
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d");

    // night behind the ticket
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#1a160f");
    bg.addColorStop(1, "#0d0b08");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // the paper ticket
    const x0 = 70, y0 = 70, cw = W - 140, ch = H - 140, stubY = y0 + ch - 290;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 50;
    ctx.shadowOffsetY = 18;
    ctx.fillStyle = "#f3e9d4";
    ctx.beginPath();
    ctx.roundRect(x0, y0, cw, ch, 26);
    ctx.fill();
    ctx.restore();
    const paper = ctx.createLinearGradient(x0, y0, x0 + cw, y0 + ch);
    paper.addColorStop(0, "#f6efdf");
    paper.addColorStop(1, "#e8dcc2");
    ctx.fillStyle = paper;
    ctx.beginPath();
    ctx.roundRect(x0, y0, cw, ch, 26);
    ctx.fill();

    // the photograph, cropped around the walker
    const art = $("#artwork img");
    const px = x0 + 50, py = y0 + 50, pw = cw - 100, ph = 820;
    const iw = art.naturalWidth, ih = art.naturalHeight;
    const scale = Math.max(pw / iw, ph / ih);
    const sw = pw / scale, sh = ph / scale;
    const sx = Math.min(iw - sw, Math.max(0, iw * 0.48 - sw / 2));
    const sy = Math.min(ih - sh, Math.max(0, ih * 0.62 - sh / 2));
    ctx.drawImage(art, sx, sy, sw, sh, px, py, pw, ph);
    ctx.strokeStyle = "rgba(90, 70, 40, 0.35)";
    ctx.lineWidth = 2;
    ctx.strokeRect(px, py, pw, ph);

    // words
    const ink = "#1f1a12", soft = "#7a6a4f";
    const cx = W / 2;
    ctx.textAlign = "center";
    ctx.fillStyle = soft;
    ctx.font = '500 22px "Be Vietnam Pro", sans-serif';
    ctx.letterSpacing = "4px";
    ctx.fillText(t("ticket.brand"), cx, py + ph + 70);
    ctx.letterSpacing = "0px";

    ctx.fillStyle = ink;
    ctx.font = '600 84px "Dancing Script", cursive';
    ctx.fillText(t("hall.artworkTitle"), cx, py + ph + 165);

    ctx.fillStyle = "#5a4a33";
    ctx.font = '400 40px "Dancing Script", cursive';
    const poemLine = t("poem")[0].join(" ");
    wrapLines(ctx, poemLine, cw - 160).slice(0, 2).forEach((l, i) => ctx.fillText(l, cx, py + ph + 235 + i * 50));

    ctx.fillStyle = soft;
    ctx.font = '400 26px "Be Vietnam Pro", sans-serif';
    ctx.fillText(`${t("hall.photographer")} · ${t("hall.place")}`, cx, stubY - 40);

    // perforation and notches
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    [x0, x0 + cw].forEach((nx) => {
      ctx.beginPath();
      ctx.arc(nx, stubY, 26, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
    ctx.fillStyle = "#0f0d09";
    [x0, x0 + cw].forEach((nx) => {
      ctx.beginPath();
      ctx.arc(nx, stubY, 26, nx === x0 ? -Math.PI / 2 : Math.PI / 2, nx === x0 ? Math.PI / 2 : (3 * Math.PI) / 2);
      ctx.fill();
    });
    ctx.strokeStyle = "rgba(90, 70, 40, 0.45)";
    ctx.setLineDash([10, 12]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0 + 46, stubY);
    ctx.lineTo(x0 + cw - 46, stubY);
    ctx.stroke();
    ctx.setLineDash([]);

    // the stub
    const when = visitedAt.date || new Date();
    const fmt = new Intl.DateTimeFormat(state.lang === "vi" ? "vi-VN" : "en-US", {
      day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
    ctx.textAlign = "left";
    ctx.fillStyle = ink;
    ctx.font = '600 50px "Dancing Script", cursive';
    ctx.fillText(t("ticket.admit"), x0 + 70, stubY + 105);
    ctx.fillStyle = soft;
    ctx.font = '400 26px "Be Vietnam Pro", sans-serif';
    ctx.fillText(`${t("ticket.visited")}: ${fmt.format(when)}`, x0 + 70, stubY + 170);
    ctx.textAlign = "right";
    ctx.font = '500 24px "Be Vietnam Pro", sans-serif';
    ctx.letterSpacing = "3px";
    ctx.fillText(t("ticket.number"), x0 + cw - 70, stubY + 105);
    ctx.letterSpacing = "0px";

    return new Promise((resolve) => c.toBlob(resolve, "image/png"));
  }

  function keepsakeStatus(text) {
    $("#keepsake-status").textContent = text;
  }

  async function saveTicket() {
    const btn = $("#ticket-btn");
    btn.disabled = true;
    try {
      const blob = await makeTicket();
      const file = new File([blob], t("ticket.file"), { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: t("hall.artworkTitle") });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }
      keepsakeStatus(t("farewell.saved"));
    } catch (err) {
      if (err && err.name !== "AbortError") console.error(err);
    } finally {
      btn.disabled = false;
    }
  }

  async function shareForest() {
    const url = location.href.split("#")[0].split("?")[0];
    try {
      if (navigator.share) {
        await navigator.share({ title: "Sylvan Muse", url });
      } else {
        await navigator.clipboard.writeText(url);
        keepsakeStatus(t("farewell.copied"));
      }
    } catch (err) {
      if (err && err.name !== "AbortError") console.error(err);
    }
  }

  /* ---------- Scene flow ---------- */
  const fadeMs = () => (reducedMotion.matches ? 800 : 1600);

  function later(fn, ms) {
    const id = setTimeout(fn, ms);
    state.timers.push(id);
    return id;
  }

  function clearTimers() {
    state.timers.forEach(clearTimeout);
    state.timers = [];
  }

  function goTo(name, delay = fadeMs()) {
    clearTimers();
    state.typing = null;
    const prev = scenes[state.scene];
    prev.classList.remove("is-active");
    prev.inert = true;
    state.scene = name;
    state.entered = false;
    setHint(false);
    later(() => {
      const next = scenes[name];
      next.inert = false;
      next.classList.add("is-active");
      state.entered = true;
      enter[name]();
    }, delay);
  }

  const enter = {
    threshold() {
      stopMusic();
      roomTone(false);
      stopAmbient();
      resetHall();
      resetFarewell();
      $(".choice").focus({ preventScroll: true });
    },

    entrance() {
      visitedAt.date = new Date();
      startFall();
      roomTone(true);
      $("#welcome").focus({ preventScroll: true });
      const [first, second] = $$(".entrance__line");
      later(() => type(first, {
        speed: 110,
        pause: 0.6,
        onDone: () => later(() => type(second, {
          speed: 100,
          pause: 0.6,
          onDone: () => {
            later(() => setHint(true), 600);
            later(() => goTo("story"), 3500);
          },
        }), 700),
      }), 700);
    },

    story() {
      loadMusic().catch(() => {});
      state.storyDone = false;
      $$("#wall-text li").forEach((li) => li.classList.remove("is-shown"));
      paintGlow();
      setStoryLight(0.12);
      drawTrail(26000);
      setHint(true);
      later(() => typeStoryLine(0), 900);
    },

    hall() {
      resetHall();
      roomTone(false);
      startMusic();
      later(() => scenes.hall.classList.add("is-lit"), 600);
      later(startAmbient, 3000);
      later(showPlacard, 5000);
      state.stanzaTimer = later(() => showStanza(0), 8000);
      later(showQuestion, CONFIG.questionDelayMs);
    },

    farewell() {
      stopAmbient();
      if (state.answer === "yes") {
        $("#heart").classList.add("is-shown");
        releasePetals();
        $("#note-form").hidden = false;
        if (!isNarrow.matches) $("#note").focus({ preventScroll: true });
        // the ticket and sharing are there even if she never sends a note
        later(() => ($("#keepsake").hidden = false), 1800);
      } else {
        showThanks(t("farewell.thanksNo"));
      }
    },
  };

  /* Scene 3 — wall text, one line at a time */
  const STORY_PAUSES = [1300, 1300, 1100, 1300];

  const SHUTTER_LINE = 3; // "Và khẽ bấm máy." / "And he took the shot."

  function typeStoryLine(i) {
    const lines = $$("#wall-text li");
    if (!lines[i]) return;
    lines[i].classList.add("is-shown");
    setStoryLight(0.18 + i * 0.1);
    type(lines[i], {
      speed: 80,
      pause: 0.55,
      onDone: () => {
        if (i === SHUTTER_LINE) later(takeTheShot, 450);
        if (i < lines.length - 1) {
          later(() => typeStoryLine(i + 1), STORY_PAUSES[i] ?? 1600);
        } else {
          state.storyDone = true;
          later(() => goTo("hall"), 3400);
        }
      },
    });
  }

  function drawTrail(duration) {
    const path = $("#trail-path");
    const length = path.getTotalLength();
    path.style.transition = "none";
    path.style.strokeDasharray = `${length}`;
    path.style.strokeDashoffset = `${length}`;
    path.getBoundingClientRect();
    path.style.transition = `stroke-dashoffset ${duration}ms cubic-bezier(0.33, 0, 0.2, 1)`;
    path.style.strokeDashoffset = "0";
  }

  /* Scene 4 — poem, stanza by stanza */
  function showStanza(i) {
    const stanzas = $$("#poem .stanza");
    if (!stanzas[i]) return;
    clearTimeout(state.stanzaTimer);
    stanzas.forEach((s, j) => s.classList.toggle("is-past", j < i));
    stanzas[i].classList.add("is-shown");
    state.stanzaIndex = i;
    keepInView(stanzas[i]);
    // Quieter keys here: Holocene is playing.
    type(stanzas[i], {
      speed: 170,
      volume: 0.3,
      onDone: () => {
        if (i < stanzas.length - 1) state.stanzaTimer = later(() => showStanza(i + 1), 4000);
        else later(() => scenes.hall.classList.add("is-signed"), 1800);
      },
    });
  }

  function keepInView(el) {
    const panel = $(".hall__panel");
    const bottom = el.offsetTop + el.offsetHeight;
    if (bottom > panel.scrollTop + panel.clientHeight - 140) {
      panel.scrollTo({ top: bottom - panel.clientHeight + 160, behavior: reducedMotion.matches ? "auto" : "smooth" });
    }
  }

  /* Scene 5 — the question */
  function showQuestion() {
    const q = $("#question");
    if (!q.hidden) return;
    q.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => q.classList.add("is-shown")));
    keepInView(q);
  }

  function resetHall() {
    clearTimeout(state.stanzaTimer);
    state.stanzaIndex = -1;
    scenes.hall.classList.remove("is-lit", "is-signed");
    $(".placard").classList.remove("is-shown");
    resetPlacard();
    $$("#poem .stanza").forEach((s) => s.classList.remove("is-shown", "is-past"));
    $$("#poem .ch").forEach((c) => c.classList.remove("on", "is-caret"));
    const q = $("#question");
    q.hidden = true;
    q.classList.remove("is-shown");
    $(".hall__panel").scrollTop = 0;
  }

  /* Scene 6 — farewell */
  function showThanks(text) {
    const el = $("#farewell-thanks");
    buildTyped(el, text);
    el.focus({ preventScroll: true });
    type(el, {
      speed: 120,
      volume: 0.35,
      onDone: () => later(() => {
        $("#keepsake").hidden = false;
        $("#again").hidden = false;
      }, 1200),
    });
  }

  function resetFarewell() {
    const form = $("#note-form");
    form.reset();
    form.hidden = true;
    $("#note-error").hidden = true;
    const send = $("#note-send");
    send.disabled = false;
    send.dataset.i18n = "farewell.send";
    send.textContent = t("farewell.send");
    const thanks = $("#farewell-thanks");
    thanks.textContent = "";
    $("#heart").classList.remove("is-shown");
    $("#again").hidden = true;
    $("#keepsake").hidden = true;
    keepsakeStatus("");
    $("#petals").replaceChildren();
  }

  function releasePetals() {
    if (reducedMotion.matches) return;
    const colors = ["#dcae63", "#f3e7c9", "#8a5530", "#c98a4b"];
    const box = $("#petals");
    for (let i = 0; i < 22; i++) {
      const p = document.createElement("span");
      p.className = "petal";
      p.style.left = `${10 + Math.random() * 80}%`;
      p.style.background = colors[i % colors.length];
      p.style.setProperty("--dx", `${(Math.random() - 0.5) * 220}px`);
      p.style.setProperty("--rot", `${180 + Math.random() * 360}deg`);
      p.style.setProperty("--dur", `${7 + Math.random() * 5}s`);
      p.style.setProperty("--delay", `${Math.random() * 3}s`);
      p.style.scale = String(0.6 + Math.random() * 0.8);
      box.appendChild(p);
    }
  }

  async function sendNote(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const send = $("#note-send");
    const error = $("#note-error");
    error.hidden = true;
    send.disabled = true;
    send.dataset.i18n = "farewell.sending";
    send.textContent = t("farewell.sending");

    const note = form.note.value.trim();
    try {
      if (form._gotcha.value) {
        // bot: pretend all is well
      } else {
        const res = await fetch(`https://formsubmit.co/ajax/${CONFIG.noteEmail}`, {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({
            _subject: `♥ ${t("gallery.name")} — a visitor loved it`,
            _template: "box",
            loved: "yes",
            message: note || "(no note — just love)",
            language: state.lang,
          }),
        });
        const data = await res.json().catch(() => ({}));
        // Before the address is activated FormSubmit answers success:"false" and emails an activation link.
        const needsActivation = /activat/i.test(data.message || "");
        if (!res.ok || (String(data.success) !== "true" && !needsActivation)) {
          throw new Error(`FormSubmit ${res.status}: ${data.message || ""}`);
        }
        if (needsActivation) console.warn("[Sylvan Muse]", data.message);
      }
      form.hidden = true;
      showThanks(t("farewell.thanksYes"));
    } catch (err) {
      console.error(err);
      error.hidden = false;
      send.disabled = false;
      send.dataset.i18n = "farewell.send";
      send.textContent = t("farewell.send");
    }
  }

  /* ---------- Skipping ahead ---------- */
  function skip() {
    const now = performance.now();
    if (!state.entered || now - state.lastSkip < 400) return;
    state.lastSkip = now;

    switch (state.scene) {
      case "entrance":
        goTo("story");
        break;
      case "story":
        if (!state.storyDone) {
          clearTimers();
          if (state.typing) state.typing.finish(false);
          $$("#wall-text li").forEach((li) => li.classList.add("is-shown"));
          $$("#wall-text .ch").forEach((c) => c.classList.add("on"));
          state.storyDone = true;
          drawTrail(1500);
          later(() => goTo("hall"), 3500);
        } else {
          goTo("hall");
        }
        break;
      case "hall": {
        scenes.hall.classList.add("is-lit");
        showPlacard();
        startAmbient();
        if (state.typing) state.typing.finish();
        else if (state.stanzaIndex < $$("#poem .stanza").length - 1) showStanza(state.stanzaIndex + 1);
        else showQuestion();
        break;
      }
      case "farewell":
        if (state.typing) state.typing.finish();
        break;
    }
  }

  function setHint(on) {
    $("#hint").classList.toggle("is-shown", on);
  }

  /* ---------- Music: Apple Music's official 30-second preview, looped ----------
     Decoded into the same Web Audio context the key sounds use. That context is
     unlocked by the language tap, so the music can start later without another
     tap — on iPhone too — and the loop can crossfade into itself. */
  const music = { buffer: null, loading: null, gain: null, sources: [], loopTimer: 0, want: false, muted: false };
  const LOOP_FADE = 3; // seconds of crossfade where the clip meets itself

  function loadMusic() {
    if (music.loading || !keys.ctx) return music.loading || Promise.reject(new Error("No audio"));
    music.loading = fetch(CONFIG.musicPreviewUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`Music ${res.status}`);
        return res.arrayBuffer();
      })
      .then((data) => new Promise((resolve, reject) => keys.ctx.decodeAudioData(data, resolve, reject)))
      .then((buffer) => (music.buffer = buffer))
      .catch((err) => {
        music.loading = null;
        throw err;
      });
    return music.loading;
  }

  function startMusic() {
    if (!keys.ctx) return;
    $("#music").hidden = false;
    music.want = true;
    loadMusic()
      .then(() => {
        if (!music.want || music.sources.length) return;
        const ctx = keys.ctx;
        if (!music.gain) {
          music.gain = ctx.createGain();
          music.gain.connect(ctx.destination);
        }
        const now = ctx.currentTime;
        music.gain.gain.cancelScheduledValues(now);
        music.gain.gain.setValueAtTime(0, now);
        if (!music.muted) music.gain.gain.linearRampToValueAtTime(CONFIG.musicVolume, now + CONFIG.musicFadeSec);
        playSegment(now + 0.05);
        setMusicPlaying(true);
      })
      .catch((err) => {
        console.warn("[Sylvan Muse] music unavailable:", err);
        $("#music").hidden = true;
      });
  }

  function playSegment(at) {
    const ctx = keys.ctx;
    const buf = music.buffer;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    const end = at + buf.duration;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(1, at + LOOP_FADE);
    g.gain.setValueAtTime(1, end - LOOP_FADE);
    g.gain.linearRampToValueAtTime(0, end);
    src.connect(g).connect(music.gain);
    src.start(at);
    src.onended = () => (music.sources = music.sources.filter((s) => s !== src));
    music.sources.push(src);
    // queue the next pass a few seconds early so it is never late, even in a background tab
    const next = end - LOOP_FADE;
    music.loopTimer = setTimeout(() => music.want && playSegment(next), Math.max(0, (next - ctx.currentTime - 4) * 1000));
  }

  function stopMusic() {
    music.want = false;
    clearTimeout(music.loopTimer);
    const hide = () => ($("#music").hidden = true);
    if (!keys.ctx || !music.gain) return hide();
    const now = keys.ctx.currentTime;
    music.gain.gain.cancelScheduledValues(now);
    music.gain.gain.setValueAtTime(music.gain.gain.value, now);
    music.gain.gain.linearRampToValueAtTime(0, now + 1.5);
    const playing = music.sources;
    music.sources = [];
    setTimeout(() => {
      playing.forEach((s) => s.stop());
      hide();
      setMusicPlaying(false);
    }, 1600);
  }

  function toggleMute() {
    music.muted = !music.muted;
    if (keys.ctx && keys.ctx.state === "suspended") keys.ctx.resume();
    if (music.gain) {
      const now = keys.ctx.currentTime;
      music.gain.gain.cancelScheduledValues(now);
      music.gain.gain.setValueAtTime(music.gain.gain.value, now);
      music.gain.gain.linearRampToValueAtTime(music.muted ? 0 : CONFIG.musicVolume, now + 0.8);
    }
    setMusicPlaying(!music.muted);
  }

  function setMusicPlaying(on) {
    const btn = $("#music-toggle");
    btn.classList.toggle("is-playing", on && !music.muted);
    btn.setAttribute("aria-pressed", String(!music.muted));
    btn.dataset.i18nAttr = `aria-label:${music.muted ? "music.unmute" : "music.mute"}`;
    btn.setAttribute("aria-label", t(music.muted ? "music.unmute" : "music.mute"));
  }

  /* ---------- Ambient: dust in the sunbeams, a few falling leaves ---------- */
  const ambient = { canvas: $("#ambient"), ctx: null, raf: 0, motes: [], leaves: [], w: 0, h: 0, last: 0, stopAt: 0, running: false, sprite: null };

  function makeSprite() {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255, 244, 214, 1)");
    grad.addColorStop(0.25, "rgba(243, 222, 170, 0.55)");
    grad.addColorStop(1, "rgba(220, 174, 99, 0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return c;
  }

  function sizeAmbient() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ambient.w = window.innerWidth;
    ambient.h = window.innerHeight;
    ambient.canvas.width = ambient.w * dpr;
    ambient.canvas.height = ambient.h * dpr;
    ambient.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function spawnMote(anywhere) {
    return {
      x: Math.random() * ambient.w,
      y: anywhere ? Math.random() * ambient.h : ambient.h + 10,
      r: 2 + Math.random() * 5,
      vx: (Math.random() - 0.5) * 6,
      vy: -(3 + Math.random() * 9),
      phase: Math.random() * Math.PI * 2,
      speed: 0.4 + Math.random() * 0.9,
    };
  }

  function spawnLeaf(anywhere) {
    const colors = ["#8a5530", "#b06d34", "#dcae63", "#66683a"];
    return {
      x: Math.random() * ambient.w,
      y: anywhere ? Math.random() * ambient.h : -20,
      size: 5 + Math.random() * 5,
      vy: 14 + Math.random() * 16,
      sway: 18 + Math.random() * 30,
      phase: Math.random() * Math.PI * 2,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 1.2,
      color: colors[Math.floor(Math.random() * colors.length)],
    };
  }

  function startAmbient() {
    if (reducedMotion.matches) return;
    ambient.stopAt = 0;
    ambient.canvas.classList.add("is-on");
    if (ambient.running) return;
    ambient.ctx = ambient.ctx || ambient.canvas.getContext("2d");
    ambient.sprite = ambient.sprite || makeSprite();
    sizeAmbient();
    const narrow = isNarrow.matches;
    ambient.motes = Array.from({ length: narrow ? 24 : 44 }, () => spawnMote(true));
    ambient.leaves = Array.from({ length: narrow ? 4 : 7 }, () => spawnLeaf(true));
    ambient.running = true;
    ambient.last = performance.now();
    ambient.raf = requestAnimationFrame(tick);
  }

  function stopAmbient() {
    ambient.canvas.classList.remove("is-on");
    if (ambient.running) ambient.stopAt = performance.now() + 4200;
  }

  function tick(now) {
    if (ambient.stopAt && now > ambient.stopAt) {
      ambient.running = false;
      ambient.ctx.clearRect(0, 0, ambient.w, ambient.h);
      return;
    }
    const dt = Math.min(0.05, (now - ambient.last) / 1000);
    ambient.last = now;
    const { ctx, w, h, sprite } = ambient;
    ctx.clearRect(0, 0, w, h);

    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < ambient.motes.length; i++) {
      const m = ambient.motes[i];
      m.phase += dt * m.speed;
      m.x += (m.vx + Math.sin(m.phase) * 4) * dt;
      m.y += m.vy * dt;
      if (m.y < -20 || m.x < -20 || m.x > w + 20) ambient.motes[i] = spawnMote(false);
      const a = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(m.phase * 2.3));
      const d = m.r * 4;
      ctx.globalAlpha = a;
      ctx.drawImage(sprite, m.x - d / 2, m.y - d / 2, d, d);
    }

    ctx.globalCompositeOperation = "source-over";
    for (let i = 0; i < ambient.leaves.length; i++) {
      const l = ambient.leaves[i];
      l.phase += dt * 0.9;
      l.rot += l.vr * dt;
      l.y += l.vy * dt;
      const x = l.x + Math.sin(l.phase) * l.sway;
      if (l.y > h + 20) ambient.leaves[i] = spawnLeaf(false);
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.translate(x, l.y);
      ctx.rotate(l.rot);
      ctx.scale(1, Math.abs(Math.cos(l.phase * 1.7)) * 0.7 + 0.3);
      ctx.fillStyle = l.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, l.size, l.size * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ambient.raf = requestAnimationFrame(tick);
  }

  /* ---------- Wiring ---------- */
  function chooseLanguage(lang) {
    if (state.scene !== "threshold" || !state.entered) return;
    state.lang = lang;
    initKeySounds();
    doorChime();
    applyTranslations();
    const bloom = $("#bloom");
    bloom.classList.remove("is-opening");
    bloom.getBoundingClientRect();
    bloom.classList.add("is-opening");
    goTo("entrance", reducedMotion.matches ? 900 : 1700);
  }

  function init() {
    Object.entries(scenes).forEach(([name, el]) => (el.inert = name !== state.scene));
    applyTranslations();

    $$(".choice").forEach((btn) => btn.addEventListener("click", () => chooseLanguage(btn.dataset.lang)));
    $('[data-action="next"]').addEventListener("click", skip);
    $$("[data-answer]").forEach((btn) =>
      btn.addEventListener("click", () => {
        state.answer = btn.dataset.answer;
        goTo("farewell");
      })
    );
    $("#note-form").addEventListener("submit", sendNote);
    $("#note-close").addEventListener("click", () => {
      $("#note-form").hidden = true;
      showThanks(t("farewell.thanksSkip"));
    });
    $("#again").addEventListener("click", () => goTo("threshold"));
    $("#ticket-btn").addEventListener("click", saveTicket);
    $("#share-btn").addEventListener("click", shareForest);
    setupPlacard();
    isNarrow.addEventListener("change", setupPlacard);
    $(".placard").addEventListener("click", blowPlacard);
    $(".placard").addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        blowPlacard();
      }
    });
    $("#placard-return").addEventListener("click", returnPlacard);
    $("#music-toggle").addEventListener("click", toggleMute);
    $("#music-credit").href = CONFIG.appleMusicUrl;
    // The artwork src is set here rather than in the HTML, so link previews don't pick it up.
    const art = $("#artwork img");
    $("#artwork source").srcset = art.dataset.webp;
    art.src = art.dataset.src;

    document.addEventListener("keydown", (e) => {
      if (e.key !== " " && e.key !== "Enter") return;
      if (e.target.closest("button, a, input, textarea, select, iframe, [contenteditable], .placard")) return;
      e.preventDefault();
      skip();
    });

    $("#gallery").addEventListener("click", (e) => {
      if (e.target.closest("button, a, input, textarea, label, form, .placard")) return;
      skip();
    });

    window.addEventListener("resize", () => {
      if (ambient.running) sizeAmbient();
      if (fall.raf) sizeFall();
    });
  }

  init();
})();
