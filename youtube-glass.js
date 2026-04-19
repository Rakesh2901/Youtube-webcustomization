/**
 * ══════════════════════════════════════════════════════════════
 *  APPLE VISION OS  ·  YouTube Interaction Engine  v3
 *  Enhancer for YouTube  ·  Windows  ·  RTX 4050
 * ══════════════════════════════════════════════════════════════
 *  Bugs fixed in v3:
 *  [3] Double highlight   — YouTube paper-ripple suppressed via CSS var
 *  [4] Search tooltip     — new initSearchTooltip() module
 *  [5] Search blur scroll — initHeaderGlass() now only toggles a CSS
 *                           class; never sets inline background-alpha > 0.78
 * ══════════════════════════════════════════════════════════════
 *
 *  HOW TO TWEAK:
 *  All numbers that affect behaviour live in the CFG object below.
 *  Colour / blur / radius tweaks belong in the CSS :root block.
 */

(function () {
  "use strict";

  /* ╔══════════════════════════════════════════════════════════╗
     ║  CONFIG — adjust behaviour here                          ║
     ╚══════════════════════════════════════════════════════════╝ */
  const CFG = {
    cursor: {
      haloLag:       0.18,    // 0 = instant | 1 = never catches up
    },
    tilt: {
      maxDeg:        7,       // maximum rotation in degrees
      scale:         1.018,   // card scale-up on hover
      perspective:   1000,    // perspective depth (px)
      lerpIn:        0.15,    // tilt follow speed (higher = snappier)
      lerpOut:       0.14,    // reset speed
    },
    ripple: {
      duration:      480,     // ms — match the CSS animation duration
    },
    reveal: {
      rootMargin:    "100px", // how early to start reveal before viewport
      threshold:     0.04,    // how much of element must be visible
      staggerMs:     35,      // delay between consecutive cards
    },
    header: {
      hideThreshold: 80,      // px scrolled before auto-hide activates
      hideOnDelta:   10,      // scroll delta that triggers hide
      showOnDelta:   6,       // scroll delta that triggers show
    },
    toast: {
      duration:      2400,    // ms visible
    },
    tooltip: {
      hoverDelay:    400,     // ms hover before tooltip appears
      text:          "Search YouTube",
      hint:          "/",     // keyboard shortcut shown in tooltip
    },
  };


  /* ╔══════════════════════════════════════════════════════════╗
     ║  UTILS                                                    ║
     ╚══════════════════════════════════════════════════════════╝ */
  const lerp    = (a, b, t) => a + (b - a) * t;
  const clamp   = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  const qs      = (sel, root = document) => root.querySelector(sel);
  const qsAll   = (sel, root = document) => root.querySelectorAll(sel);


  /* ╔══════════════════════════════════════════════════════════╗
     ║  MODULE 1 — DUAL-LAYER CURSOR                            ║
     ║  Dot  → zero-lag (set directly in mousemove handler)     ║
     ║  Halo → soft lerp trail behind dot                       ║
     ╚══════════════════════════════════════════════════════════╝ */
  function initCursor() {
    const dot  = Object.assign(document.createElement("div"), { id: "ag-cursor-dot"  });
    const halo = Object.assign(document.createElement("div"), { id: "ag-cursor-halo" });
    document.body.append(dot, halo);

    let mx = innerWidth / 2, my = innerHeight / 2;
    let hx = mx, hy = my;

    /* Dot is set synchronously in mousemove — zero rAF lag */
    document.addEventListener("mousemove", (e) => {
      mx = e.clientX;
      my = e.clientY;
      dot.style.left = mx + "px";
      dot.style.top  = my + "px";
    }, { passive: true });

    /* Halo enlarges when hovering interactive elements */
    const INTERACTIVE =
      "a, button, tp-yt-paper-button, yt-button-shape button, " +
      "ytd-rich-item-renderer, ytd-grid-video-renderer, " +
      "yt-chip-cloud-chip-renderer, ytd-guide-entry-renderer";

    document.addEventListener("mouseover", (e) => {
      if (e.target.closest(INTERACTIVE)) halo.classList.add("ag-big");
    }, { passive: true });

    document.addEventListener("mouseout", (e) => {
      if (e.target.closest(INTERACTIVE)) halo.classList.remove("ag-big");
    }, { passive: true });

    /* Click feedback on dot and halo */
    document.addEventListener("mousedown", () => {
      halo.classList.add("ag-click");
      dot.style.transform = "translate(-50%,-50%) scale(1.6)";
    }, { passive: true });

    document.addEventListener("mouseup", () => {
      halo.classList.remove("ag-click");
      dot.style.transform = "translate(-50%,-50%) scale(1)";
    }, { passive: true });

    /* Halo lerp loop — this is where the intentional lag lives */
    (function tickHalo() {
      hx = lerp(hx, mx, CFG.cursor.haloLag);
      hy = lerp(hy, my, CFG.cursor.haloLag);
      halo.style.left = hx + "px";
      halo.style.top  = hy + "px";
      requestAnimationFrame(tickHalo);
    })();
  }


  /* ╔══════════════════════════════════════════════════════════╗
     ║  MODULE 2 — 3D CARD TILT                                 ║
     ║  Per-card lerp stored in a WeakMap — no memory leaks     ║
     ╚══════════════════════════════════════════════════════════╝ */
  function initTilt() {
    const CARDS =
      "ytd-rich-item-renderer, ytd-video-renderer, " +
      "ytd-grid-video-renderer, ytd-reel-item-renderer, " +
      "ytd-compact-video-renderer";

    /* Each card gets its own state object */
    const state = new WeakMap();
    const getS  = (el) => {
      if (!state.has(el)) state.set(el, { rx:0, ry:0, trx:0, try_:0, raf:null });
      return state.get(el);
    };

    /* Smoothly return card to flat */
    function resetCard(el) {
      const s = getS(el);
      cancelAnimationFrame(s.raf);
      s.trx = 0; s.try_ = 0;
      const out = () => {
        s.rx = lerp(s.rx, 0, CFG.tilt.lerpOut);
        s.ry = lerp(s.ry, 0, CFG.tilt.lerpOut);
        applyTilt(el, s.rx, s.ry, 1);
        if (Math.abs(s.rx) > 0.03 || Math.abs(s.ry) > 0.03) {
          s.raf = requestAnimationFrame(out);
        } else {
          el.style.transform = "";
        }
      };
      s.raf = requestAnimationFrame(out);
    }

    function applyTilt(el, rx, ry, scale) {
      el.style.transform =
        `perspective(${CFG.tilt.perspective}px) ` +
        `rotateX(${rx}deg) rotateY(${ry}deg) ` +
        `scale3d(${scale},${scale},${scale}) translateZ(0)`;
    }

    document.addEventListener("mousemove", (e) => {
      const el = e.target.closest(CARDS);
      if (!el) return;

      const s    = getS(el);
      const rect = el.getBoundingClientRect();
      const px   = (e.clientX - rect.left) / rect.width  - 0.5;
      const py   = (e.clientY - rect.top)  / rect.height - 0.5;

      s.trx  = -py * CFG.tilt.maxDeg * 2;
      s.try_ =  px * CFG.tilt.maxDeg * 2;

      cancelAnimationFrame(s.raf);
      const tick = () => {
        s.rx = lerp(s.rx, s.trx,  CFG.tilt.lerpIn);
        s.ry = lerp(s.ry, s.try_, CFG.tilt.lerpIn);
        applyTilt(el, s.rx, s.ry, CFG.tilt.scale);
        if (Math.abs(s.rx - s.trx) > 0.05 || Math.abs(s.ry - s.try_) > 0.05) {
          s.raf = requestAnimationFrame(tick);
        }
      };
      s.raf = requestAnimationFrame(tick);
    }, { passive: true });

    document.addEventListener("mouseout", (e) => {
      const el = e.target.closest(CARDS);
      if (el && !el.contains(e.relatedTarget)) resetCard(el);
    }, { passive: true });
  }


  /* ╔══════════════════════════════════════════════════════════╗
     ║  MODULE 3 — CUSTOM RIPPLE                                ║
     ║  FIX [3]: YouTube's tp-yt-paper-ripple is hidden via    ║
     ║  --paper-ripple-opacity:0 in CSS :root.                  ║
     ║  This module provides a single clean replacement.        ║
     ╚══════════════════════════════════════════════════════════╝ */
  function initRipple() {
    const TARGETS =
      "tp-yt-paper-button, yt-button-shape button, " +
      "yt-chip-cloud-chip-renderer, ytd-guide-entry-renderer, " +
      "ytd-mini-guide-entry-renderer, ytd-menu-service-item-renderer";

    document.addEventListener("click", (e) => {
      const el = e.target.closest(TARGETS);
      if (!el) return;

      const rect  = el.getBoundingClientRect();
      const size  = Math.max(rect.width, rect.height);
      const r     = document.createElement("span");
      r.className = "ag-ripple";
      r.style.cssText =
        `width:${size}px; height:${size}px; ` +
        `left:${e.clientX - rect.left - size / 2}px; ` +
        `top:${e.clientY - rect.top  - size / 2}px;`;

      const prevOverflow = el.style.overflow;
      el.style.overflow  = "hidden";
      el.style.position  = el.style.position || "relative";
      el.appendChild(r);

      setTimeout(() => {
        r.remove();
        el.style.overflow = prevOverflow;
      }, CFG.ripple.duration);
    }, { passive: true });
  }


  /* ╔══════════════════════════════════════════════════════════╗
     ║  MODULE 4 — SPECULAR THUMBNAIL SHINE                     ║
     ║  Radial highlight on thumbnail that tracks cursor        ║
     ╚══════════════════════════════════════════════════════════╝ */
  function initShine() {
    const CARDS    = "ytd-rich-item-renderer, ytd-grid-video-renderer";
    const shineMap = new WeakMap();

    function getShine(card) {
      if (shineMap.has(card)) return shineMap.get(card);
      const thumb = qs("ytd-thumbnail", card);
      if (!thumb) return null;
      const el = document.createElement("div");
      el.style.cssText =
        "position:absolute; inset:0; border-radius:16px; pointer-events:none; " +
        "z-index:2; opacity:0; mix-blend-mode:overlay; will-change:background; " +
        "transition:opacity 0.28s ease;";
      thumb.style.position = "relative";
      thumb.appendChild(el);
      shineMap.set(card, el);
      return el;
    }

    document.addEventListener("mousemove", (e) => {
      const card  = e.target.closest(CARDS);
      if (!card) return;
      const thumb = qs("ytd-thumbnail", card);
      if (!thumb) return;
      const rect = thumb.getBoundingClientRect();
      const px   = ((e.clientX - rect.left) / rect.width  * 100).toFixed(1);
      const py   = ((e.clientY - rect.top)  / rect.height * 100).toFixed(1);
      const s    = getShine(card);
      if (!s) return;
      s.style.opacity    = "1";
      s.style.background = `radial-gradient(circle at ${px}% ${py}%, rgba(255,255,255,0.20) 0%, transparent 60%)`;
    }, { passive: true });

    document.addEventListener("mouseout", (e) => {
      const card = e.target.closest(CARDS);
      if (card && !card.contains(e.relatedTarget)) {
        const s = shineMap.get(card);
        if (s) s.style.opacity = "0";
      }
    }, { passive: true });
  }


  /* ╔══════════════════════════════════════════════════════════╗
     ║  MODULE 5 — CARD AMBIENT GLOW                            ║
     ║  Radial blue glow that follows cursor inside each card   ║
     ╚══════════════════════════════════════════════════════════╝ */
  function initCardGlow() {
    const CARDS = "ytd-rich-item-renderer, ytd-grid-video-renderer";

    document.addEventListener("mousemove", (e) => {
      const card = e.target.closest(CARDS);
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const x    = ((e.clientX - rect.left) / rect.width  * 100).toFixed(1);
      const y    = ((e.clientY - rect.top)  / rect.height * 100).toFixed(1);
      card.style.background =
        `radial-gradient(ellipse 80% 70% at ${x}% ${y}%, rgba(79,195,247,0.055) 0%, transparent 70%)`;
    }, { passive: true });

    document.addEventListener("mouseout", (e) => {
      const card = e.target.closest(CARDS);
      if (card && !card.contains(e.relatedTarget)) card.style.background = "";
    }, { passive: true });
  }


  /* ╔══════════════════════════════════════════════════════════╗
     ║  MODULE 6 — SCROLL REVEAL                                ║
     ║  IntersectionObserver — staggered entry animations       ║
     ╚══════════════════════════════════════════════════════════╝ */
  function initReveal() {
    const ITEMS =
      "ytd-rich-item-renderer, ytd-video-renderer, " +
      "ytd-grid-video-renderer, ytd-reel-item-renderer, " +
      "ytd-comment-renderer";

    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry, i) => {
        if (!entry.isIntersecting) return;
        /* Stagger each visible item */
        setTimeout(
          () => entry.target.classList.add("ag-visible"),
          i * CFG.reveal.staggerMs
        );
        io.unobserve(entry.target);
      });
    }, { rootMargin: CFG.reveal.rootMargin, threshold: CFG.reveal.threshold });

    function tag(root) {
      qsAll(ITEMS, root).forEach((el) => {
        if (el.classList.contains("ag-reveal")) return;
        el.classList.add("ag-reveal");
        io.observe(el);
      });
    }

    tag(document);

    /* Watch for dynamically added cards (infinite scroll, SPA nav) */
    new MutationObserver((muts) => {
      muts.forEach((m) => {
        m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          if (n.matches?.(ITEMS)) { n.classList.add("ag-reveal"); io.observe(n); }
          n.querySelectorAll?.(ITEMS).forEach((el) => {
            if (!el.classList.contains("ag-reveal")) { el.classList.add("ag-reveal"); io.observe(el); }
          });
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
  }


  /* ╔══════════════════════════════════════════════════════════╗
     ║  MODULE 7 — HEADER GLASS (scroll-driven)                 ║
     ║  FIX [5]: Never sets inline `background` — only          ║
     ║  toggles .ag-scrolled CSS class. CSS handles alpha.      ║
     ║  This prevents the search bar from going black.          ║
     ╚══════════════════════════════════════════════════════════╝ */
  function initHeaderGlass() {
    const h = qs("#masthead, ytd-masthead");
    if (!h) return;

    let ticking = false;

    window.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        /* Only class toggle — no inline style for background */
        if (window.scrollY > 20) {
          h.classList.add("ag-scrolled");
        } else {
          h.classList.remove("ag-scrolled");
        }
        ticking = false;
      });
    }, { passive: true });
  }


  /* ╔══════════════════════════════════════════════════════════╗
     ║  MODULE 8 — SMART HEADER (auto-hide on scroll down)      ║
     ╚══════════════════════════════════════════════════════════╝ */
  function initSmartHeader() {
    const h = qs("#masthead, ytd-masthead");
    if (!h) return;

    let lastY  = window.scrollY;
    let hidden = false;

    window.addEventListener("scroll", () => {
      const y     = window.scrollY;
      const delta = y - lastY;

      if (delta > CFG.header.hideOnDelta && y > CFG.header.hideThreshold && !hidden) {
        h.classList.add("ag-hidden");
        hidden = true;
      } else if (delta < -CFG.header.showOnDelta && hidden) {
        h.classList.remove("ag-hidden");
        hidden = false;
      }
      lastY = y;
    }, { passive: true });
  }


  /* ╔══════════════════════════════════════════════════════════╗
     ║  MODULE 9 — SEARCH TOOLTIP                               ║
     ║  FIX [4]: Implements the missing search hover tooltip    ║
     ║  Shows after CFG.tooltip.hoverDelay ms hover             ║
     ╚══════════════════════════════════════════════════════════╝ */
  function initSearchTooltip() {
    const form = qs("#search-form, ytd-searchbox");
    if (!form) return;

    /* Create tooltip element */
    const tip = document.createElement("div");
    tip.className = "ag-search-tooltip";
    tip.innerHTML =
      `${CFG.tooltip.text} &nbsp;<kbd>${CFG.tooltip.hint}</kbd>`;
    form.style.position = "relative";
    form.appendChild(tip);

    let showTimer = null;

    const show = () => {
      clearTimeout(showTimer);
      showTimer = setTimeout(() => tip.classList.add("ag-visible"), CFG.tooltip.hoverDelay);
    };

    const hide = () => {
      clearTimeout(showTimer);
      tip.classList.remove("ag-visible");
    };

    /* Show on hover, hide on focus or mouse-leave */
    form.addEventListener("mouseenter", show);
    form.addEventListener("mouseleave", hide);
    form.addEventListener("focusin",    hide);  /* tooltip hides when user starts typing */
    form.addEventListener("focusout",   () => {
      /* Re-show tooltip briefly on blur if still hovering */
      const check = setTimeout(() => {
        if (form.matches(":hover")) show();
      }, 200);
      form.addEventListener("mouseleave", () => clearTimeout(check), { once: true });
    });
  }


  /* ╔══════════════════════════════════════════════════════════╗
     ║  MODULE 10 — SEARCH BAR SPRING SCALE                     ║
     ╚══════════════════════════════════════════════════════════╝ */
  function initSearchSpring() {
    /* Target the container, not the input */
    const wrap = qs("#search-form, ytd-searchbox");
    const inp  = qs("input#search, #search-input input, ytd-searchbox input");
    if (!wrap || !inp) return;

    wrap.style.transition = "transform 300ms cubic-bezier(0.34,1.56,0.64,1)";
    inp.addEventListener("focus", () => { wrap.style.transform = "scale(1.013)"; });
    inp.addEventListener("blur",  () => { wrap.style.transform = ""; });
  }


  /* ╔══════════════════════════════════════════════════════════╗
     ║  MODULE 11 — LIKE BUTTON BURST                           ║
     ╚══════════════════════════════════════════════════════════╝ */
  function initLikeBurst() {
    const SYMBOLS = ["✦","◈","◇","⋆","∘","·","★","◉"];
    const COLORS  = ["#4fc3f7","#b4a0ff","#64e6c8","#fff","#ffd0a0"];

    document.addEventListener("click", (e) => {
      const btn = e.target.closest(
        "ytd-toggle-button-renderer, #segmented-like-button, #like-button"
      );
      if (!btn) return;

      const rect = btn.getBoundingClientRect();
      const cx   = rect.left + rect.width  / 2;
      const cy   = rect.top  + rect.height / 2;

      for (let i = 0; i < 7; i++) {
        const angle = (i / 7) * Math.PI * 2 + Math.random() * 0.4;
        const dist  = 48 + Math.random() * 32;
        const p     = document.createElement("div");
        p.textContent = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
        p.style.cssText =
          `position:fixed; left:${cx}px; top:${cy}px; ` +
          `font-size:${12 + Math.random() * 8}px; color:${COLORS[i % 5]}; ` +
          `pointer-events:none; z-index:999997; font-weight:300; ` +
          `transform:translate(-50%,-50%); ` +
          `animation:agBurst 0.65s cubic-bezier(0.16,1,0.3,1) forwards; ` +
          `--tx:${Math.cos(angle) * dist}px; --ty:${Math.sin(angle) * dist}px;`;
        document.body.appendChild(p);
        setTimeout(() => p.remove(), 700);
      }
    }, { passive: true });
  }


  /* ╔══════════════════════════════════════════════════════════╗
     ║  MODULE 12 — CHIP MICRO-TILT                             ║
     ╚══════════════════════════════════════════════════════════╝ */
  function initChipTilt() {
    new MutationObserver(() => {
      qsAll("yt-chip-cloud-chip-renderer:not([ag-tilt])").forEach((chip) => {
        chip.setAttribute("ag-tilt", "1");
        chip.addEventListener("mousemove", (e) => {
          const r  = chip.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width - 0.5;
          chip.style.transform = `translateY(-2px) rotate(${px * 3.5}deg) scale(1.03)`;
        }, { passive: true });
        chip.addEventListener("mouseleave", () => {
          chip.style.transform = "";
        }, { passive: true });
      });
    }).observe(document.body, { childList: true, subtree: true });
  }


  /* ╔══════════════════════════════════════════════════════════╗
     ║  MODULE 13 — AVATAR PULSE                                ║
     ╚══════════════════════════════════════════════════════════╝ */
  function initAvatarPulse() {
    const s = document.createElement("style");
    s.textContent = `
      @keyframes agAvatarRing {
        0%,100% { box-shadow: 0 0 0 0   rgba(79,195,247,0); }
        50%     { box-shadow: 0 0 0 5px rgba(79,195,247,0.20); }
      }
      #avatar-btn:hover yt-img-shadow img,
      #avatar-btn:focus yt-img-shadow img {
        animation: agAvatarRing 1.6s ease-in-out infinite !important;
      }
    `;
    document.head.appendChild(s);
  }


  /* ╔══════════════════════════════════════════════════════════╗
     ║  MODULE 14 — TOAST                                       ║
     ╚══════════════════════════════════════════════════════════╝ */
  function showToast(msg) {
    let t = qs("#ag-toast");
    if (!t) {
      t = Object.assign(document.createElement("div"), { id: "ag-toast", className: "ag-toast" });
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("ag-toast-show");
    clearTimeout(t._tmr);
    t._tmr = setTimeout(() => t.classList.remove("ag-toast-show"), CFG.toast.duration);
  }


  /* ╔══════════════════════════════════════════════════════════╗
     ║  MODULE 15 — KEYBOARD SHORTCUTS                          ║
     ║  T = hue-shift toggle                                    ║
     ║  B = max-blur toggle                                     ║
     ║  G = grayscale / mono toggle                             ║
     ╚══════════════════════════════════════════════════════════╝ */
  function initKeys() {
    document.addEventListener("keydown", (e) => {
      const ae = document.activeElement;
      if (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable) return;

      const html = document.documentElement;
      switch (e.key) {
        case "T": {
          const on = html.style.filter === "hue-rotate(28deg)";
          html.style.filter = on ? "" : "hue-rotate(28deg)";
          showToast(on ? "Hue off" : "🌈 Hue shift on");
          break;
        }
        case "B":
          html.classList.toggle("ag-max-blur");
          showToast("🫧 Max blur toggled");
          break;
        case "G": {
          const on = html.style.filter === "grayscale(0.80)";
          html.style.filter = on ? "" : "grayscale(0.80)";
          showToast(on ? "Colour restored" : "◉ Mono vision on");
          break;
        }
      }
    });
  }


  /* ╔══════════════════════════════════════════════════════════╗
     ║  BOOT — initialise all modules in dependency order       ║
     ╚══════════════════════════════════════════════════════════╝ */
  function boot() {
    console.log(
      "%c  VISION OS · YouTube v3  ",
      "background:#000; color:#4fc3f7; font-size:13px; font-weight:300; " +
      "letter-spacing:0.12em; padding:6px 14px; " +
      "border:0.5px solid rgba(79,195,247,0.35);"
    );

    /* Core interactions */
    initCursor();
    initTilt();
    initRipple();
    initShine();
    initCardGlow();

    /* Content loading */
    initReveal();

    /* Header */
    initHeaderGlass();    /* class-only — no inline background */
    initSmartHeader();    /* auto-hide on scroll down          */

    /* Search — fixes [4] and [5] */
    initSearchTooltip();  /* tooltip on search bar hover       */
    initSearchSpring();   /* spring scale on focus             */

    /* Delight */
    initLikeBurst();
    initChipTilt();
    initAvatarPulse();

    /* Utilities */
    initKeys();

    /* Expose toast globally for external use */
    window.agToast = showToast;

    /* Re-run search modules on YouTube SPA navigation */
    new MutationObserver(() => {
      initSearchTooltip();
      initSearchSpring();
    }).observe(document.body, { childList: true, subtree: false });
  }

  /* Wait for DOM if needed, then boot */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

})();
