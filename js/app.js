(function () {
  "use strict";

  var media = window.MEDIA || { photos: [], videos: [] };
  var photos = media.photos;
  var videos = media.videos;

  var $ = function (id) { return document.getElementById(id); };
  var ROW = 8;    // must match grid-auto-rows in CSS
  var GAP = 14;   // must match .tile margin-bottom (8 on mobile)

  $("stat-photos").textContent = photos.length;
  $("stat-videos").textContent = videos.length;
  $("year").textContent = new Date().getFullYear();

  /* ---------------- Header state ---------------- */
  var header = document.querySelector(".site-header");
  var navLinks = document.querySelectorAll("[data-nav]");
  function onScroll() {
    header.classList.toggle("is-solid", window.scrollY > window.innerHeight * 0.6);
    var current = null;
    ["photos", "videos"].forEach(function (id) {
      if ($(id).getBoundingClientRect().top < 120) current = id;
    });
    navLinks.forEach(function (a) { a.classList.toggle("is-current", a.dataset.nav === current); });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------------- Photo grid ---------------- */
  var grid = $("photo-grid");
  var tiles = [];
  var reveal = "IntersectionObserver" in window
    ? new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add("is-visible"); reveal.unobserve(e.target); }
        });
      }, { rootMargin: "0px 0px -40px 0px" })
    : null;

  photos.forEach(function (p, i) {
    var tile = document.createElement("button");
    tile.className = "tile";
    tile.type = "button";
    tile.dataset.index = i;
    tile.dataset.orient = p.w >= p.h ? "landscape" : "portrait";
    tile.setAttribute("aria-label", "Open photo " + (i + 1) + " of " + photos.length);

    var img = document.createElement("img");
    img.src = p.thumb;
    img.alt = "Rajyash Regus interior, photo " + (i + 1);
    img.loading = "lazy";
    img.decoding = "async";
    img.width = p.w; img.height = p.h;
    img.addEventListener("load", function () { img.classList.add("is-loaded"); });
    if (img.complete) img.classList.add("is-loaded");

    var label = document.createElement("span");
    label.className = "tile-label";
    label.textContent = String(i + 1).padStart(3, "0") + "  —  View";

    tile.appendChild(img);
    tile.appendChild(label);
    tile.addEventListener("click", function () { openLightbox(i); });
    grid.appendChild(tile);
    tiles.push(tile);
    if (reveal) reveal.observe(tile); else tile.classList.add("is-visible");
  });

  function layoutGrid() {
    var first = tiles.find(function (t) { return !t.hidden; });
    if (!first) return;
    var colWidth = first.getBoundingClientRect().width;
    var gap = parseFloat(getComputedStyle(first).marginBottom) || GAP;
    tiles.forEach(function (t) {
      var p = photos[t.dataset.index];
      var h = colWidth * (p.h / p.w);
      t.style.gridRowEnd = "span " + Math.ceil((h + gap) / ROW);
    });
  }
  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layoutGrid, 120);
  });
  layoutGrid();

  // Filters
  var chips = document.querySelectorAll(".chip");
  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      var f = chip.dataset.filter;
      chips.forEach(function (c) {
        var on = c === chip;
        c.classList.toggle("is-active", on);
        c.setAttribute("aria-selected", on);
      });
      tiles.forEach(function (t) { t.hidden = f !== "all" && t.dataset.orient !== f; });
      layoutGrid();
    });
  });

  function visibleIndexes() {
    return tiles.filter(function (t) { return !t.hidden; }).map(function (t) { return +t.dataset.index; });
  }

  /* ---------------- Lightbox ---------------- */
  var lb = $("lightbox");
  var stage = $("lb-stage");
  var low = $("lb-low");
  var full = $("lb-full");
  var loader = $("lb-loader");
  var counter = $("lb-counter");
  var openLink = $("lb-open");
  var strip = $("lb-strip");
  var list = [];      // indexes currently navigable (respects filter)
  var pos = 0;        // position within list
  var loadToken = 0;
  var loadedFull = {}; // full-res URLs already fetched this session
  var lastFocus = null;

  function buildStrip() {
    strip.innerHTML = "";
    list.forEach(function (idx, n) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-label", "Photo " + (idx + 1));
      var im = document.createElement("img");
      im.src = photos[idx].thumb;
      im.loading = "lazy";
      im.alt = "";
      b.appendChild(im);
      b.addEventListener("click", function () { show(n); });
      strip.appendChild(b);
    });
  }

  function show(n) {
    pos = (n + list.length) % list.length;
    var p = photos[list[pos]];
    var token = ++loadToken;

    stage.classList.remove("is-changing");
    void stage.offsetWidth; // restart fade animation
    stage.classList.add("is-changing");

    low.src = p.thumb;
    full.classList.remove("is-loaded");
    full.removeAttribute("src");
    counter.textContent = String(pos + 1).padStart(2, "0") + " / " + String(list.length).padStart(2, "0");
    openLink.href = p.full;

    var cached = loadedFull[p.full];
    loader.classList.toggle("is-active", !cached);
    var hi = new Image();
    hi.decoding = "async";
    hi.onload = function () {
      loadedFull[p.full] = true;
      if (token !== loadToken) return;
      full.src = p.full;
      full.classList.add("is-loaded");
      loader.classList.remove("is-active");
      preloadNeighbour();
    };
    hi.onerror = function () { if (token === loadToken) loader.classList.remove("is-active"); };
    hi.src = p.full;

    Array.prototype.forEach.call(strip.children, function (b, i) {
      b.classList.toggle("is-current", i === pos);
    });
    var cur = strip.children[pos];
    if (cur) cur.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }

  // Warm the cache for the next photo only after the current one is done, to save bandwidth.
  function preloadNeighbour() {
    var next = photos[list[(pos + 1) % list.length]];
    if (next && !loadedFull[next.full]) {
      var im = new Image();
      im.onload = function () { loadedFull[next.full] = true; };
      im.src = next.full;
    }
  }

  function openLightbox(index) {
    lastFocus = document.activeElement;
    list = visibleIndexes();
    buildStrip();
    lb.hidden = false;
    document.body.classList.add("is-locked");
    requestAnimationFrame(function () { lb.classList.add("is-open"); });
    show(Math.max(0, list.indexOf(index)));
    $("lb-close").focus();
  }

  function closeLightbox() {
    loadToken++;
    lb.classList.remove("is-open");
    document.body.classList.remove("is-locked");
    setTimeout(function () {
      lb.hidden = true;
      full.removeAttribute("src");
      low.removeAttribute("src");
    }, 250);
    if (lastFocus) lastFocus.focus({ preventScroll: true });
  }

  $("lb-prev").addEventListener("click", function () { show(pos - 1); });
  $("lb-next").addEventListener("click", function () { show(pos + 1); });
  $("lb-close").addEventListener("click", closeLightbox);
  stage.addEventListener("click", function (e) { if (e.target === stage) closeLightbox(); });

  // Swipe
  var touchX = null, touchY = null;
  stage.addEventListener("touchstart", function (e) {
    touchX = e.touches[0].clientX; touchY = e.touches[0].clientY;
  }, { passive: true });
  stage.addEventListener("touchend", function (e) {
    if (touchX === null) return;
    var dx = e.changedTouches[0].clientX - touchX;
    var dy = e.changedTouches[0].clientY - touchY;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) show(dx < 0 ? pos + 1 : pos - 1);
    touchX = null;
  });

  /* ---------------- Films ---------------- */
  var vgrid = $("video-grid");
  var player = $("player");
  var video = $("player-video");

  function fmt(sec) {
    var s = Math.round(sec);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  videos.forEach(function (v, i) {
    var card = document.createElement("button");
    card.type = "button";
    card.className = "film";
    card.setAttribute("aria-label", "Play film " + (i + 1));
    card.innerHTML =
      '<img loading="lazy" alt="" src="' + v.poster + '">' +
      '<span class="film-play"><svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg></span>' +
      '<span class="film-meta"><span class="film-title">Film ' + String(i + 1).padStart(2, "0") +
      '</span><span class="film-time">' + fmt(v.duration) + "</span></span>";
    card.addEventListener("click", function () { openPlayer(v); });
    vgrid.appendChild(card);
  });

  function openPlayer(v) {
    lastFocus = document.activeElement;
    video.poster = v.poster;
    video.src = v.src; // the actual video is only requested now
    player.hidden = false;
    document.body.classList.add("is-locked");
    requestAnimationFrame(function () { player.classList.add("is-open"); });
    var playing = video.play();
    if (playing && playing.catch) playing.catch(function () {});
    $("player-close").focus();
  }

  function closePlayer() {
    video.pause();
    video.removeAttribute("src");
    video.load(); // abort any in-flight download
    player.classList.remove("is-open");
    document.body.classList.remove("is-locked");
    setTimeout(function () { player.hidden = true; }, 250);
    if (lastFocus) lastFocus.focus({ preventScroll: true });
  }

  $("player-close").addEventListener("click", closePlayer);
  player.addEventListener("click", function (e) { if (e.target === player || e.target.classList.contains("player-frame")) closePlayer(); });

  /* ---------------- Keyboard ---------------- */
  document.addEventListener("keydown", function (e) {
    if (!lb.hidden) {
      if (e.key === "Escape") closeLightbox();
      else if (e.key === "ArrowRight") show(pos + 1);
      else if (e.key === "ArrowLeft") show(pos - 1);
    } else if (!player.hidden && e.key === "Escape") {
      closePlayer();
    }
  });
})();
