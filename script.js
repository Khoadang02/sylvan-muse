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
    // "Holocene" by Bon Iver, official upload — from https://www.youtube.com/watch?v=TWcyIpul8OE
    youtubeVideoId: "TWcyIpul8OE",
    musicVolume: 60,
    musicFadeMs: 8000,
    questionDelayMs: 30000,
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
    storyIndex: 0,
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
      $('meta[name="description"]').setAttribute("content", t("meta.description"));
    }
    buildWallText();
    buildPoem();
  }

  function buildWallText() {
    const list = $("#wall-text");
    list.replaceChildren(
      ...t("story.lines").map((line) => {
        const li = document.createElement("li");
        li.textContent = line;
        return li;
      })
    );
  }

  function buildPoem() {
    const poem = $("#poem");
    poem.replaceChildren(
      ...t("poem").map((lines) => {
        const p = document.createElement("p");
        p.className = "stanza";
        lines.forEach((line) => {
          const span = document.createElement("span");
          span.textContent = line;
          p.appendChild(span);
        });
        return p;
      })
    );
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
      stopAmbient();
      resetHall();
      resetFarewell();
      $(".choice").focus({ preventScroll: true });
    },

    entrance() {
      $("#welcome").focus({ preventScroll: true });
      later(() => setHint(true), 3500);
      later(() => goTo("story"), 8000);
    },

    story() {
      loadYouTubeAPI().catch(() => {});
      state.storyIndex = 0;
      $$("#wall-text li").forEach((li) => li.classList.remove("is-shown"));
      drawTrail(25000);
      setHint(true);
      later(() => showStoryLine(0), 900);
    },

    hall() {
      resetHall();
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
  const STORY_PAUSES = [4600, 4400, 3400, 3000];

  function showStoryLine(i) {
    const lines = $$("#wall-text li");
    if (!lines[i]) return;
    lines[i].classList.add("is-shown");
    state.storyIndex = i + 1;
    if (i < lines.length - 1) {
      later(() => showStoryLine(i + 1), STORY_PAUSES[i] ?? 3200);
    } else {
      later(() => goTo("hall"), 4800);
    }
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
    if (i < stanzas.length - 1) {
      const lineCount = stanzas[i].children.length;
      state.stanzaTimer = later(() => showStanza(i + 1), 5000 + lineCount * 2400);
    }
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
    const q = $("#question");
    q.hidden = true;
    q.classList.remove("is-shown");
    $(".hall__panel").scrollTop = 0;
  }

  /* Scene 6 — farewell */
  function showThanks(text) {
    const el = $("#farewell-thanks");
    el.textContent = text;
    requestAnimationFrame(() => el.classList.add("is-shown"));
    el.focus({ preventScroll: true });
    later(() => ($("#again").hidden = false), 2500);
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
    thanks.classList.remove("is-shown");
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
        if (state.storyIndex < $$("#wall-text li").length) {
          clearTimers();
          $$("#wall-text li").forEach((li) => li.classList.add("is-shown"));
          state.storyIndex = Infinity;
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
        if (state.stanzaIndex < $$("#poem .stanza").length - 1) showStanza(state.stanzaIndex + 1);
        else showQuestion();
        break;
      }
    }
  }

  function setHint(on) {
    $("#hint").classList.toggle("is-shown", on);
  }

  /* ---------- Music (YouTube IFrame API, lazy) ---------- */
  const music = { api: null, player: null, ready: false, want: false, muted: false, fadeRaf: 0, checkTimer: 0 };

  function loadYouTubeAPI() {
    if (music.api) return music.api;
    music.api = new Promise((resolve, reject) => {
      if (window.YT && window.YT.Player) return resolve(window.YT);
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prev === "function") prev();
        resolve(window.YT);
      };
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.async = true;
      s.onerror = () => {
        music.api = null;
        reject(new Error("YouTube API failed to load"));
      };
      document.head.appendChild(s);
    });
    return music.api;
  }

  function createPlayer(YT) {
    // Build the iframe ourselves so it carries allow="autoplay" from the start;
    // with the visitor's earlier click, browsers then let it play with sound.
    const params = new URLSearchParams({ enablejsapi: "1", autoplay: "0", playsinline: "1", rel: "0" });
    if (location.origin.startsWith("http")) params.set("origin", location.origin);
    const iframe = document.createElement("iframe");
    iframe.id = "yt-player";
    iframe.src = `https://www.youtube-nocookie.com/embed/${CONFIG.youtubeVideoId}?${params}`;
    iframe.allow = "autoplay; encrypted-media; picture-in-picture";
    iframe.title = "Holocene — Bon Iver (YouTube)";
    $("#yt-player").replaceWith(iframe);

    music.player = new YT.Player(iframe, {
      events: {
        onReady: () => {
          music.ready = true;
          if (music.want) beginPlayback();
        },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.PLAYING) $("#music-play").hidden = true;
        },
      },
    });
  }

  function startMusic() {
    $("#music").hidden = false;
    music.want = true;
    loadYouTubeAPI()
      .then((YT) => {
        if (!music.want) return;
        if (!music.player) createPlayer(YT);
        else if (music.ready) beginPlayback();
      })
      .catch(() => {});
  }

  function beginPlayback() {
    const p = music.player;
    p.setVolume(0);
    if (music.muted) p.mute();
    else p.unMute();
    p.playVideo();
    fadeVolume(0, CONFIG.musicVolume, CONFIG.musicFadeMs);
    clearTimeout(music.checkTimer);
    music.checkTimer = setTimeout(() => {
      // Autoplay was blocked (common on iOS): offer a gentle play button.
      if (music.want && p.getPlayerState() !== window.YT.PlayerState.PLAYING) $("#music-play").hidden = false;
    }, 3500);
  }

  function fadeVolume(from, to, ms, done) {
    cancelAnimationFrame(music.fadeRaf);
    const start = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - start) / ms);
      if (music.ready) music.player.setVolume(Math.round(from + (to - from) * k));
      if (k < 1) music.fadeRaf = requestAnimationFrame(step);
      else if (done) done();
    };
    music.fadeRaf = requestAnimationFrame(step);
  }

  function stopMusic() {
    music.want = false;
    clearTimeout(music.checkTimer);
    $("#music-play").hidden = true;
    const hide = () => ($("#music").hidden = true);
    if (!music.ready) return hide();
    fadeVolume(music.player.getVolume(), 0, 1500, () => {
      music.player.pauseVideo();
      music.player.seekTo(0, true);
      hide();
    });
  }

  function toggleMute() {
    music.muted = !music.muted;
    const btn = $("#music-mute");
    btn.dataset.i18n = music.muted ? "music.unmute" : "music.mute";
    btn.textContent = t(btn.dataset.i18n);
    btn.setAttribute("aria-pressed", String(music.muted));
    if (!music.ready) return;
    if (music.muted) music.player.mute();
    else music.player.unMute();
  }

  function playFromButton() {
    if (!music.ready) return;
    music.player.setVolume(0);
    if (!music.muted) music.player.unMute();
    music.player.playVideo();
    fadeVolume(0, CONFIG.musicVolume, 3000);
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
    $("#music-mute").addEventListener("click", toggleMute);
    $("#music-play").addEventListener("click", playFromButton);

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
