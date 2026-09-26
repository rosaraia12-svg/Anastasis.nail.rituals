/* ------------------------------------------------------------------ *
 * sequence.js — click-to-zoom viewer for Anastasis Nail Rituals.
 *
 * The stage opens on a still (frame 0, identical in both clips): the
 * wide shot of the studio, with two hotspots layered on top. Tapping
 * one plays that clip's 120 pre-split WebP frames forward (0 -> 119),
 * eased like a camera settling into place, then blooms a liquid-glass
 * listino panel open. Its "Indietro" button reverses the choreography:
 * panel away, frames 119 -> 0, hotspots back.
 *
 * Frames are canvas-drawn (not a <video>) because scrubbing
 * <video>.currentTime frame-by-frame is unreliable on iOS Safari.
 * The viewer card is locked to the clips' own 16:9 aspect ratio, so a
 * source pixel maps to the canvas with a single scale factor — no
 * cover-crop offset math, and hotspot positions are plain CSS percent.
 * ------------------------------------------------------------------ */
(function () {
  "use strict";

  var N = 120;
  function pad3(i) { return String(i).padStart(3, "0"); }

  var STATIONS = {
    nails: {
      dotId: "dot-nails",
      chipId: "chip-nails",
      folder: "./frames-nails/",
      over: "Anastasis Nail Rituals",
      title: "Nails",
      durIn: 1300,
      durOut: 1150,
      items: [
        { name: "Ricostruzione", desc: "Struttura, forma e lunghezza costruite su misura.", price: "€45" },
        { name: "Refill", desc: "Riequilibrio e mantenimento ogni 3–4 settimane.", price: "€30" },
        { name: "Semipermanente", desc: "Colore e lucentezza fino a 3 settimane.", price: "€25" },
        { name: "Rimozione", desc: "Rimozione di gel o semipermanente.", price: "€10" }
      ]
    },
    spa: {
      dotId: "dot-spa",
      chipId: "chip-spa",
      folder: "./frames-spa/",
      over: "Anastasis Nail Rituals",
      title: "Hands SPA",
      durIn: 2500,
      durOut: 2200,
      items: [
        { name: "Manicure SPA", desc: "Scrub, massaggio e cura completa delle mani.", price: "€35" },
        { name: "Massaggio mani", desc: "Massaggio dedicato con oli essenziali.", price: "€20" },
        { name: "Paraffina", desc: "Trattamento nutriente e rilassante.", price: "€15" },
        { name: "Manicure + Massaggio", desc: "Il rituale completo Hands SPA.", price: "€40" }
      ]
    }
  };

  var stage   = document.getElementById("stage");
  var viewer  = document.getElementById("viewer");
  var canvas  = document.getElementById("frames");
  var ctx     = canvas.getContext("2d", { alpha: false });
  var glass   = document.getElementById("glass");
  var glassOver  = document.getElementById("glass-over");
  var glassTitle = document.getElementById("glass-title");
  var glassList  = document.getElementById("glass-list");
  var glassBack  = document.getElementById("glass-back");
  var loader  = document.getElementById("loader");
  var fill    = document.getElementById("loaderFill");
  var ltxt    = document.getElementById("loaderTxt");

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var state = "idle";          // idle | opening | open | closing
  var activeKey = null;
  var drawnW = 0, drawnH = 0;

  /* ---------- easing ----------
     gentle quad curves (not cubic): cubic bunches too many of the 120
     frames into a short burst at one end, which reads as a stutter
     rather than a smooth camera move. */
  function easeOutQuad(t) { return t * (2 - t); }
  function easeInQuad(t) { return t * t; }

  /* ---------- canvas ---------- */
  function resizeCanvas() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    var h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (w === drawnW && h === drawnH) return;
    canvas.width = w;
    canvas.height = h;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    drawnW = w;
    drawnH = h;
    paint(STATIONS[activeKey || "nails"].images, currentIdx);
  }

  var currentIdx = 0;
  function paint(images, idx) {
    idx = idx < 0 ? 0 : idx > N - 1 ? N - 1 : idx;
    var img = images && images[idx];
    if (!img || !img.complete || !img.naturalWidth) return;
    currentIdx = idx;
    var cw = canvas.width, ch = canvas.height;
    // viewer is aspect-locked to the source (16:9): a plain stretch-fill
    // is already a correct, undistorted "cover" draw.
    ctx.drawImage(img, 0, 0, cw, ch);
  }

  /* ---------- preload ---------- */
  var totalFrames = N * 2;
  var loadedFrames = 0;
  var firstPainted = false;

  function loadSequence(station, onEach) {
    var images = new Array(N);
    station.images = images;
    for (var i = 0; i < N; i++) {
      (function (idx) {
        var im = new Image();
        im.decoding = "async";
        im.src = station.folder + pad3(idx + 1) + ".webp";
        images[idx] = im;

        var settled = false;
        var finish = function () {
          if (settled) return;
          settled = true;
          loadedFrames++;
          onEach(pct());
          if (idx === 0 && !firstPainted && station === STATIONS.nails) {
            firstPainted = true;
            paint(images, 0);
          }
          if (loadedFrames === totalFrames) boot();
        };

        var onLoaded = function () {
          // decode() fully decodes the bitmap ahead of time, so the very
          // first drawImage() during playback never has to decode on the
          // spot (that on-demand decode is what makes an animation
          // stutter the first time it reaches a frame it hasn't shown
          // yet). Some browsers/webviews never settle this promise
          // though, so it only gets a short grace period — past that we
          // move on rather than hang the whole preloader on one frame.
          if (!im.decode) { finish(); return; }
          var raced = false;
          var give_up = setTimeout(function () {
            if (!raced) { raced = true; finish(); }
          }, 1200);
          im.decode().then(function () {
            if (!raced) { raced = true; clearTimeout(give_up); finish(); }
          }, function () {
            if (!raced) { raced = true; clearTimeout(give_up); finish(); }
          });
        };

        if (im.complete) onLoaded();
        else im.onload = onLoaded;
        im.onerror = finish;
      })(i);
    }
  }

  function pct() { return Math.round((loadedFrames / totalFrames) * 100); }

  /* ---------- glass content ---------- */
  function fillGlass(station) {
    glassOver.textContent = station.over;
    glassTitle.textContent = station.title;
    glassList.innerHTML = "";
    station.items.forEach(function (it) {
      var li = document.createElement("li");
      li.className = "svc__item";
      li.innerHTML =
        '<span class="svc__text">' +
          '<span class="svc__name"></span>' +
          '<span class="svc__desc"></span>' +
        '</span>' +
        '<span class="svc__price"></span>';
      li.querySelector(".svc__name").textContent = it.name;
      li.querySelector(".svc__desc").textContent = it.desc;
      li.querySelector(".svc__price").textContent = it.price;
      glassList.appendChild(li);
    });
  }

  /* ---------- glass panel animation (CSS custom props) ---------- */
  function setGlassT(t) {
    var e = reduce ? t : t * t * (3 - 2 * t);
    glass.style.setProperty("--go", e.toFixed(3));
    glass.style.setProperty("--gs", (0.94 + 0.06 * e).toFixed(3));
    glass.style.setProperty("--gy", (26 - 26 * e).toFixed(1) + "px");
    glass.classList.toggle("is-live", e > 0.002);
  }

  function currentGlassT() {
    var v = parseFloat(glass.style.getPropertyValue("--go"));
    return isNaN(v) ? 0 : v;
  }

  function animate(durationMs, ease, onStep, onDone) {
    if (reduce) { onStep(1); onDone(); return; }
    var start = null;
    function frame(now) {
      if (start === null) start = now;
      var t = Math.min(1, (now - start) / durationMs);
      onStep(ease(t));
      if (t < 1) requestAnimationFrame(frame);
      else onDone();
    }
    requestAnimationFrame(frame);
  }

  // Dedicated, cancellable tween for the glass panel: tapping "Indietro"
  // while the open-animation is still mid-fade used to start a second,
  // competing rAF loop — whichever of the two finished last silently won
  // and could leave the panel stuck open. A generation counter makes a
  // newer call invalidate whatever tween was already running, and always
  // eases from wherever --go actually is right now (not from an assumed
  // 0 or 1), so an interrupted fade reverses smoothly instead of jumping.
  var glassGen = 0;
  function animateGlass(to, durationMs, onDone) {
    var myGen = ++glassGen;
    var from = currentGlassT();
    if (reduce) { setGlassT(to); if (onDone) onDone(); return; }
    var start = null;
    function frame(now) {
      if (myGen !== glassGen) return; // superseded by a newer call
      if (start === null) start = now;
      var t = Math.min(1, (now - start) / durationMs);
      setGlassT(from + (to - from) * t);
      if (t < 1) requestAnimationFrame(frame);
      else if (onDone) onDone();
    }
    requestAnimationFrame(frame);
  }

  /* ---------- state machine ---------- */
  function openStation(key) {
    if (state !== "idle") return;
    var station = STATIONS[key];
    if (!station.images) return; // not preloaded yet (shouldn't happen: loader waits)

    activeKey = key;
    state = "opening";
    stage.classList.add("is-active");
    viewer.classList.add("is-busy");
    fillGlass(station);

    animate(station.durIn, easeOutQuad, function (e) {
      paint(station.images, Math.round(e * (N - 1)));
    }, function () {
      paint(station.images, N - 1);
      state = "open";
      animateGlass(1, 420);
    });
  }

  function closeStation() {
    if (state !== "open") return;
    var station = STATIONS[activeKey];
    state = "closing";

    animateGlass(0, 320, function () {
      animate(station.durOut, easeInQuad, function (e) {
        paint(station.images, Math.round((1 - e) * (N - 1)));
      }, function () {
        paint(station.images, 0);
        state = "idle";
        activeKey = null;
        stage.classList.remove("is-active");
        viewer.classList.remove("is-busy");
      });
    });
  }

  /* ---------- wiring ---------- */
  function wire() {
    document.getElementById(STATIONS.nails.dotId).addEventListener("click", function () { openStation("nails"); });
    document.getElementById(STATIONS.spa.dotId).addEventListener("click", function () { openStation("spa"); });
    document.getElementById(STATIONS.nails.chipId).addEventListener("click", function () { openStation("nails"); });
    document.getElementById(STATIONS.spa.chipId).addEventListener("click", function () { openStation("spa"); });
    glassBack.addEventListener("click", closeStation);

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && state === "open") closeStation();
    });

    if ("ResizeObserver" in window) {
      new ResizeObserver(resizeCanvas).observe(canvas);
    } else {
      window.addEventListener("resize", resizeCanvas, { passive: true });
    }
    window.addEventListener("orientationchange", function () {
      setTimeout(resizeCanvas, 300);
    });
  }

  /* ---------- boot ---------- */
  var booted = false;
  function boot() {
    if (booted) return;
    booted = true;
    resizeCanvas();
    paint(STATIONS.nails.images, 0);
    if (loader) {
      loader.classList.add("is-hidden");
      setTimeout(function () { if (loader.parentNode) loader.remove(); }, 700);
    }
    wire();
  }

  function onEach(p) {
    if (fill) fill.style.width = p + "%";
    if (ltxt) ltxt.textContent = "Caricamento " + p + "%";
  }

  resizeCanvas();
  loadSequence(STATIONS.nails, onEach);
  loadSequence(STATIONS.spa, onEach);

  /* safety net: start anyway if a few frames never settle */
  setTimeout(function () { if (!booted && loadedFrames >= totalFrames * 0.85) boot(); }, 12000);
})();
