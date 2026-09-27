/* ------------------------------------------------------------------ *
 * sequence.js — click-to-zoom viewer for Anastasis Nail Rituals.
 *
 * The stage opens on a still (frame 0, the same wide shot in every
 * clip): the studio, with a hotspot per station (Nails, Hands SPA,
 * "Scopri altro") layered on top. Tapping one plays that clip's
 * pre-split WebP frames forward (each station has its own frame count
 * and duration), eased like a camera settling into place.
 *
 * Nails and Hands SPA then bloom a liquid-glass listino panel open
 * directly; its "Indietro" button reverses the whole choreography.
 * "Scopri altro" is a gateway instead: the zoom lands on the wall of
 * paintings and reveals two more hotspots (Ge.lashpmu, Corsi) rather
 * than a listino. Picking one of those opens its own glass panel
 * without any further zoom; its "Indietro" only drops back to the two
 * painting hotspots, and a separate "Vista d'insieme" control reverses
 * the zoom the rest of the way back to the wide shot.
 *
 * Frames are canvas-drawn (not a <video>) because scrubbing
 * <video>.currentTime frame-by-frame is unreliable on iOS Safari.
 * The viewer card is locked to the clips' own 16:9 aspect ratio, so a
 * source pixel maps to the canvas with a single scale factor — no
 * cover-crop offset math, and hotspot positions are plain CSS percent.
 * ------------------------------------------------------------------ */
(function () {
  "use strict";

  function pad3(i) { return String(i).padStart(3, "0"); }

  var STATION_KEYS = ["nails", "spa", "courses"];

  var STATIONS = {
    nails: {
      dotId: "dot-nails",
      chipId: "chip-nails",
      folder: "./frames-nails/",
      frameCount: 120,
      over: "Anastasis Nail Rituals",
      title: "Nails",
      durIn: 1300,
      durOut: 1150,
      items: [
        { header: "Ricostruzione" },
        { name: "Corta", price: "€75" },
        { name: "Media", price: "€80" },
        { name: "Lunga", price: "€85" },
        { name: "Estrema", price: "Su preventivo" },
        { header: "Refill" },
        { name: "Corto", price: "€55" },
        { name: "Medio", price: "€60" },
        { name: "Lungo", price: "€70" },
        { name: "Tardivo / correttivo", price: "Da €60" },
        { header: "Semipermanente" },
        { name: "Rinforzato", price: "€45" },
        { header: "Extra" },
        { name: "Babyboomer", price: "€7" },
        { name: "French", price: "€5" },
        { name: "Decori", price: "Su preventivo" },
        { header: "Mani" },
        { name: "Manicure", price: "€25" },
        { name: "Rimozione", price: "Da €10" },
        { header: "Pedicure" },
        { name: "Semipermanente classico", price: "€40" },
        { name: "Ricostruzione alluci", price: "€10" }
      ]
    },
    spa: {
      dotId: "dot-spa",
      chipId: "chip-spa",
      folder: "./frames-spa/",
      frameCount: 120,
      over: "Anastasis Nail Rituals",
      title: "Hands SPA",
      durIn: 2500,
      durOut: 2200,
      items: [
        { name: "Refresh Ritual", desc: "Detersione, scrub delicato, maschera, crema mani e breve massaggio.", price: "€30" },
        { name: "Velvet Ritual", desc: "Detersione, scrub delicato, maschera idrogel intensiva, impacco caldo, peeling enzimatico, crema mani e breve massaggio.", price: "€45" },
        { name: "Signature Ritual", desc: "Detersione in bagno di sale, scrub delicato, maschera idrogel intensiva/guanto al collagene, impacco caldo, peeling enzimatico, crema mani, patch occhi, olio e aromaterapia.", price: "€58" }
      ]
    },
    courses: {
      dotId: "dot-courses",
      chipId: "chip-courses",
      folder: "./frames-courses/",
      // only the clip's first 5s (of 10s) are used: past that point the
      // source starts shifting objects and duplicating the side table
      frameCount: 60,
      durIn: 1100,
      durOut: 1000,
      // a gateway station: the zoom lands on the paintings and reveals
      // two more hotspots (see `subs`) instead of opening its own listino
      gateway: true,
      subs: [
        {
          key: "gelashpmu",
          dotId: "dot-gelashpmu",
          // where its dot sits (matches the --dx/--dy in index.html): the
          // punch-in zoom on tap centers on this same point
          zoomX: 58.2,
          zoomY: 20,
          over: "Anastasis Nail Rituals",
          title: "Ge.lashpmu",
          items: [
            { name: "Extension ciglia", desc: "Applicazione ciglio a ciglio, effetto naturale o intenso.", price: "€60" },
            { name: "Lash lifting", desc: "Curvatura e volume delle ciglia naturali.", price: "€40" },
            { name: "PMU sopracciglia", desc: "Trucco permanente, tecnica a effetto pelo.", price: "€280" },
            { name: "PMU labbra", desc: "Trucco permanente labbra, colore naturale e definito.", price: "€220" }
          ]
        },
        {
          key: "corsi",
          dotId: "dot-corsi-sub",
          zoomX: 74.6,
          zoomY: 28,
          over: "Anastasis Nail Rituals",
          title: "Corsi",
          items: [
            { name: "Corso base ricostruzione", desc: "Tecniche di ricostruzione in gel per principianti.", price: "€250" },
            { name: "Corso nail art", desc: "Decorazioni e finiture avanzate.", price: "€150" },
            { name: "Corso semipermanente", desc: "Applicazione e rimozione professionale.", price: "€120" },
            { name: "Perfezionamento", desc: "Aggiornamento tecniche avanzate.", price: "€180" }
          ]
        }
      ]
    }
  };

  var intro   = document.getElementById("intro");
  var stage   = document.getElementById("stage");
  var viewer  = document.getElementById("viewer");
  var canvas  = document.getElementById("frames");
  var ctx     = canvas.getContext("2d", { alpha: false });
  var glass   = document.getElementById("glass");
  var glassOver  = document.getElementById("glass-over");
  var glassTitle = document.getElementById("glass-title");
  var glassList  = document.getElementById("glass-list");
  var glassBack  = document.getElementById("glass-back");
  var backOverview = document.getElementById("back-overview");
  var loader  = document.getElementById("loader");
  var fill    = document.getElementById("loaderFill");
  var ltxt    = document.getElementById("loaderTxt");

  // idle | opening | open | subdots | sub-open | closing
  //   idle -> opening -> open -> closing -> idle              (Nails, Hands SPA)
  //   idle -> opening -> subdots <-> sub-open, subdots -> closing -> idle   (Corsi gateway)
  var state = "idle";
  var activeKey = null;
  var activeSub = null;
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
    if (!images || !images.length) return;
    idx = idx < 0 ? 0 : idx > images.length - 1 ? images.length - 1 : idx;
    var img = images[idx];
    if (!img || !img.complete || !img.naturalWidth) return;
    currentIdx = idx;
    var cw = canvas.width, ch = canvas.height;
    // viewer is aspect-locked to the source (16:9): a plain stretch-fill
    // is already a correct, undistorted "cover" draw.
    ctx.drawImage(img, 0, 0, cw, ch);
  }

  /* ---------- preload ---------- */
  var totalFrames = STATION_KEYS.reduce(function (sum, key) {
    return sum + STATIONS[key].frameCount;
  }, 0);
  var loadedFrames = 0;
  var firstPainted = false;

  function loadSequence(station, onEach) {
    var images = new Array(station.frameCount);
    station.images = images;
    for (var i = 0; i < station.frameCount; i++) {
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
          // Best-effort pre-decode so the first drawImage() during
          // playback doesn't have to decode on the spot (that on-demand
          // decode is what makes an animation stutter the first time it
          // reaches a frame it hasn't shown yet). This is a pure bonus:
          // some WebKit/iOS builds never settle this promise at all, so
          // it must NEVER gate readiness — only onload/onerror do that.
          if (im.decode) { im.decode().catch(function () {}); }
        };

        if (im.complete) finish();
        else im.onload = finish;
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
      if (it.header) {
        li.className = "svc__header";
        li.textContent = it.header;
        glassList.appendChild(li);
        return;
      }
      li.className = "svc__item";
      li.innerHTML =
        '<span class="svc__text">' +
          '<span class="svc__name"></span>' +
          (it.desc ? '<span class="svc__desc"></span>' : "") +
        '</span>' +
        '<span class="svc__price"></span>';
      li.querySelector(".svc__name").textContent = it.name;
      if (it.desc) li.querySelector(".svc__desc").textContent = it.desc;
      li.querySelector(".svc__price").textContent = it.price;
      glassList.appendChild(li);
    });
  }

  /* ---------- glass panel animation (CSS custom props) ---------- */
  function setGlassT(t) {
    var e = t * t * (3 - 2 * t);
    glass.style.setProperty("--go", e.toFixed(3));
    glass.style.setProperty("--gs", (0.94 + 0.06 * e).toFixed(3));
    glass.style.setProperty("--gy", (26 - 26 * e).toFixed(1) + "px");
    glass.classList.toggle("is-live", e > 0.002);
  }

  function currentGlassT() {
    var v = parseFloat(glass.style.getPropertyValue("--go"));
    return isNaN(v) ? 0 : v;
  }

  // Cancellable the same way animateGlass() is below: the state machine's
  // own guards should already stop two frame-tweens from ever overlapping,
  // but this makes that true by construction instead of by convention.
  var animGen = 0;
  function animate(durationMs, ease, onStep, onDone) {
    var myGen = ++animGen;
    var start = null;
    function frame(now) {
      if (myGen !== animGen) return; // superseded by a newer call
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

  /* ---------- state machine ----------
     Nails / Hands SPA:  idle -> opening -> open -> closing -> idle
     Corsi (gateway):    idle -> opening -> subdots <-> sub-open
                                  subdots -> closing -> idle           */
  function openStation(key) {
    if (state !== "idle") return;
    var station = STATIONS[key];
    if (!station.images) return; // not preloaded yet (shouldn't happen: loader waits)

    activeKey = key;
    state = "opening";
    stage.classList.add("is-active");
    viewer.classList.add("is-busy");
    if (!station.gateway) fillGlass(station);

    var lastIdx = station.frameCount - 1;
    animate(station.durIn, easeOutQuad, function (e) {
      paint(station.images, Math.round(e * lastIdx));
    }, function () {
      paint(station.images, lastIdx);
      if (station.gateway) {
        state = "subdots";
        stage.classList.add("is-subdots");
      } else {
        state = "open";
        animateGlass(1, 420);
      }
    });
  }

  function openSub(subKey) {
    if (state !== "subdots") return;
    var gateway = STATIONS[activeKey];
    var sub = null;
    for (var i = 0; i < gateway.subs.length; i++) {
      if (gateway.subs[i].key === subKey) { sub = gateway.subs[i]; break; }
    }
    if (!sub) return;

    activeSub = subKey;
    state = "sub-open";
    stage.classList.remove("is-subdots");
    fillGlass(sub);

    // Punch in on the painting itself before the listino blooms open —
    // a plain CSS transform on the already-painted canvas, not a new
    // video: cheap, and it reads as "focusing in on what you tapped"
    // rather than the panel just appearing over an unchanged photo.
    canvas.style.transformOrigin = sub.zoomX + "% " + sub.zoomY + "%";
    viewer.classList.add("is-punched");
    setTimeout(function () { animateGlass(1, 420); }, 420);
  }

  // "Indietro" inside the glass panel: closes whichever glass is open.
  // A simple station's glass reverses the whole zoom back to idle; a
  // gateway's sub-listino just drops back to its own subdots, since the
  // paintings are still on screen and don't need to be re-zoomed.
  function closeGlass() {
    if (state === "open") closeToIdle();
    else if (state === "sub-open") closeSubToDots();
  }

  function closeToIdle() {
    var station = STATIONS[activeKey];
    state = "closing";

    var lastIdx = station.frameCount - 1;
    animateGlass(0, 320, function () {
      animate(station.durOut, easeInQuad, function (e) {
        paint(station.images, Math.round((1 - e) * lastIdx));
      }, function () {
        // land on the one shared idle frame (Nails frame 0), not this
        // station's own frame 0 — every clip is its own separate render
        // of "the same" wide shot, close but not pixel-identical, so
        // ending on the station's own frame made the rest look subtly
        // different depending on which hotspot you'd just closed.
        paint(STATIONS.nails.images, 0);
        state = "idle";
        activeKey = null;
        stage.classList.remove("is-active");
        viewer.classList.remove("is-busy");
      });
    });
  }

  function closeSubToDots() {
    state = "closing";
    animateGlass(0, 320, function () {
      viewer.classList.remove("is-punched"); // eases the canvas back out
      activeSub = null;
      state = "subdots";
      stage.classList.add("is-subdots");
    });
  }

  // "Vista d'insieme": leaves the gateway's subdots entirely, reversing
  // the zoom back to the wide shot and its top-level hotspots.
  function closeGateway() {
    if (state !== "subdots") return;
    var station = STATIONS[activeKey];
    state = "closing";
    stage.classList.remove("is-subdots");

    var lastIdx = station.frameCount - 1;
    animate(station.durOut, easeInQuad, function (e) {
      paint(station.images, Math.round((1 - e) * lastIdx));
    }, function () {
      paint(STATIONS.nails.images, 0); // land on the shared idle frame
      state = "idle";
      activeKey = null;
      stage.classList.remove("is-active");
      viewer.classList.remove("is-busy");
    });
  }

  /* ---------- wiring ---------- */
  function wire() {
    STATION_KEYS.forEach(function (key) {
      var station = STATIONS[key];
      document.getElementById(station.dotId).addEventListener("click", function () { openStation(key); });
      document.getElementById(station.chipId).addEventListener("click", function () { openStation(key); });
      if (station.subs) {
        station.subs.forEach(function (sub) {
          document.getElementById(sub.dotId).addEventListener("click", function () { openSub(sub.key); });
        });
      }
    });
    glassBack.addEventListener("click", closeGlass);
    if (backOverview) backOverview.addEventListener("click", closeGateway);

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (state === "open" || state === "sub-open") closeGlass();
      else if (state === "subdots") closeGateway();
    });

    if ("ResizeObserver" in window) {
      new ResizeObserver(resizeCanvas).observe(canvas);
    } else {
      window.addEventListener("resize", resizeCanvas, { passive: true });
    }
    window.addEventListener("orientationchange", function () {
      setTimeout(resizeCanvas, 300);
    });

    // Fade the "Entra nello studio" intro out as soon as the page starts
    // scrolling, so it never slides underneath the fixed brand header
    // (which has no opaque background) and overlaps it.
    var INTRO_FADE_PX = 50;
    var introTicking = false;
    function updateIntroFade() {
      introTicking = false;
      var p = Math.min(1, Math.max(0, window.scrollY / INTRO_FADE_PX));
      intro.style.opacity = String(1 - p);
      intro.style.transform = "translateY(" + (-p * 16).toFixed(1) + "px)";
    }
    window.addEventListener("scroll", function () {
      if (introTicking) return;
      introTicking = true;
      requestAnimationFrame(updateIntroFade);
    }, { passive: true });
    updateIntroFade();
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
  STATION_KEYS.forEach(function (key) { loadSequence(STATIONS[key], onEach); });

  /* safety net: start anyway if a few frames never settle */
  setTimeout(function () { if (!booted && loadedFrames >= totalFrames * 0.85) boot(); }, 12000);
})();
