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

      // quiet room tone under the typing (soft brown noise), faded in per scene
      const bedBuf = ctx.createBuffer(1, Math.floor(rate * 4), rate);
      const b = bedBuf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < b.length; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        b[i] = last * 3.5;
      }
      keys.bed = ctx.createBufferSource();
      keys.bed.buffer = bedBuf;
      keys.bed.loop = true;
      const bedTone = ctx.createBiquadFilter();
      bedTone.type = "lowpass";
      bedTone.frequency.value = 700;
      keys.bedGain = ctx.createGain();
      keys.bedGain.gain.value = 0;
      keys.bed.connect(bedTone).connect(keys.bedGain).connect(ctx.destination);
      keys.bed.start();
    }
    if (keys.ctx.state === "suspended") keys.ctx.resume();
  }

  function roomTone(on) {
    if (!keys.ctx) return;
    const g = keys.bedGain.gain;
    const t = keys.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(on && !music.muted ? 0.02 : 0, t + (on ? 3 : 4));
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
      later(() => $(".placard").classList.add("is-shown"), 5000);
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
      } else {
        showThanks(t("farewell.thanksNo"));
      }
    },
  };

  /* Scene 3 — wall text, one line at a time */
  const STORY_PAUSES = [1300, 1300, 1100, 1300];

  function typeStoryLine(i) {
    const lines = $$("#wall-text li");
    if (!lines[i]) return;
    lines[i].classList.add("is-shown");
    type(lines[i], {
      speed: 80,
      pause: 0.55,
      onDone: () => {
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
    scenes.hall.classList.remove("is-lit");
    $(".placard").classList.remove("is-shown");
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
    type(el, { speed: 120, volume: 0.35, onDone: () => later(() => ($("#again").hidden = false), 1200) });
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
        $(".placard").classList.add("is-shown");
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
    $("#again").addEventListener("click", () => goTo("threshold"));
    $("#music-toggle").addEventListener("click", toggleMute);
    $("#music-credit").href = CONFIG.appleMusicUrl;
    // The artwork src is set here rather than in the HTML, so link previews don't pick it up.
    const art = $("#artwork img");
    $("#artwork source").srcset = art.dataset.webp;
    art.src = art.dataset.src;

    document.addEventListener("keydown", (e) => {
      if (e.key !== " " && e.key !== "Enter") return;
      if (e.target.closest("button, a, input, textarea, select, iframe, [contenteditable]")) return;
      e.preventDefault();
      skip();
    });

    $("#gallery").addEventListener("click", (e) => {
      if (e.target.closest("button, a, input, textarea, label, form")) return;
      skip();
    });

    window.addEventListener("resize", () => {
      if (ambient.running) sizeAmbient();
    });
  }

  init();
})();
