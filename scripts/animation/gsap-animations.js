/**
 * GSAP Animation System
 * Scroll-triggered animations for Webflow + Lumos Framework
 *
 * Requires: GSAP, ScrollTrigger, SplitText
 * Usage: Add data-animate="type" to elements
 * Types: word-reveal, pan-left, pan-right, scroll-scrub, fade-in,
 *        fade-in-bottom, fade-in-top, fade-in-left, fade-in-right,
 *        image-fade-in, circle-expand, grid
 */

// ============================================
// LOAD GSAP AND REGISTER PLUGINS
// ============================================
document.addEventListener("DOMContentLoaded", () => {
  if (typeof window.gsap === "undefined") {
    document.documentElement.classList.add("gsap-not-found");
    document.documentElement.classList.remove("gsap-ready");
  } else {
    const pluginNames =
      document
        .querySelector("[data-gsap-load]")
        ?.getAttribute("data-gsap-load")
        ?.split(",") || [];
    const pluginsToRegister = [];

    pluginNames.forEach((name) => {
      const trimmedName = name.trim();
      if (gsap[trimmedName]) {
        pluginsToRegister.push(gsap[trimmedName]);
      } else if (window[trimmedName]) {
        pluginsToRegister.push(window[trimmedName]);
      }
    });

    if (pluginsToRegister.length > 0) {
      gsap.registerPlugin(...pluginsToRegister);
    }
  }
});

// ============================================
// ACCESSIBILITY UTILITY
// ============================================
window.a11yMotion = (function () {
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  function setAccessibleSplitText(element) {
    const originalText = element.textContent.trim();
    if (originalText) {
      element.setAttribute("aria-label", originalText);
    }
  }

  function wrapInAriaHidden(element) {
    const wrapper = document.createElement("span");
    wrapper.setAttribute("aria-hidden", "true");
    wrapper.innerHTML = element.innerHTML;
    element.innerHTML = "";
    element.appendChild(wrapper);
  }

  function instantReveal(element) {
    if (typeof gsap !== "undefined") {
      gsap.set(element, {
        opacity: 1,
        x: 0,
        y: 0,
        rotation: 0,
        filter: "blur(0px) opacity(100%)",
        visibility: "visible",
        clipPath: "none",
      });
    } else {
      element.style.opacity = "1";
      element.style.visibility = "visible";
      element.style.transform = "none";
    }
  }

  // Listen for runtime preference changes
  window
    .matchMedia("(prefers-reduced-motion: reduce)")
    .addEventListener("change", (e) => {
      if (e.matches && typeof gsap !== "undefined") {
        gsap.globalTimeline.clear();
        document.querySelectorAll("[data-animate]").forEach((el) => {
          instantReveal(el);
        });
      }
    });

  return {
    prefersReducedMotion,
    setAccessibleSplitText,
    wrapInAriaHidden,
    instantReveal,
  };
})();

// ============================================
// GLOBAL SCROLL-TRIGGERED ANIMATIONS
// ============================================
document.addEventListener("DOMContentLoaded", () => {
  const { prefersReducedMotion, setAccessibleSplitText, instantReveal } =
    window.a11yMotion;

  // Exit if animations disabled on body
  if (document.body.dataset.animations === "false") {
    document
      .querySelectorAll("[data-animate]")
      .forEach((el) => instantReveal(el));
    return;
  }

  // Exit if GSAP not loaded
  if (typeof window.gsap === "undefined") {
    console.warn("Animations skipped: GSAP not found");
    return;
  }

  // ========================================
  // TIMING VARIABLES
  // ========================================
  const TIMINGS = {
    wordReveal: {
      duration: 0.6,
      stagger: 0.4,
      delay: 0.1,
      ease: "power2.out",
    },
    scrollScrub: {
      stagger: 0.1,
      startOpacity: 0.15,
    },
    content: {
      duration: 0.8,
      ease: "power2.out",
    },
    image: {
      duration: 0.8,
      ease: "power2.out",
    },
    grid: {
      duration: 0.6,
      stagger: 0.1,
      ease: "power2.out",
    },
  };

  // ========================================
  // ANIMATION VARIABLES
  // ========================================
  const PAN = {
    distance: 50,
  };

  const IMAGE = {
    circleStartSize: 5,
    circleEndSize: 300,
  };

  // ========================================
  // TOGGLE ACTIONS
  // ========================================
  const ACTION_PRESETS = {
    "play-once": "play none none none",
    reverse: "play none none reverse",
    restart: "restart none none none",
    reset: "play none none reset",
    complete: "play complete none reverse",
  };

  function getToggleActions(element, fallback = "play-once") {
    const value = element.dataset.animateAction || fallback;
    if (value.startsWith("custom:")) {
      return value.slice(7).trim();
    }
    return ACTION_PRESETS[value] || ACTION_PRESETS[fallback];
  }

  // ========================================
  // EYEBROW MARKER UTILITY
  // ========================================
  function getEyebrowContext(element) {
    const layout = element.closest(".u-eyebrow-layout");
    if (!layout) return null;
    const marker = layout.querySelector(".u-eyebrow-marker");
    if (!marker) return null;
    const textEl = layout.querySelector(".u-eyebrow-text");
    return { marker, textEl, layout };
  }

  function animateMarker(marker, { from, scrollTriggerConfig }) {
    gsap.set(marker, { opacity: 0, ...from });
    gsap.to(marker, {
      opacity: 1,
      x: 0,
      y: 0,
      duration: TIMINGS.content.duration,
      ease: TIMINGS.content.ease,
      scrollTrigger: scrollTriggerConfig,
    });
  }

  function getDirectionFrom(animateType) {
    const directionMap = {
      "fade-in": { y: "4rem" },
      "fade-in-bottom": { y: "2rem" },
      "fade-in-top": { y: "-2rem" },
      "fade-in-left": { x: "-2rem" },
      "fade-in-right": { x: "2rem" },
      "image-fade-in": { y: "3rem" },
      "word-reveal": { y: "1rem" },
      "scroll-scrub": {},
    };
    return directionMap[animateType] || {};
  }

  // ========================================
  // WORD REVEAL — Masked slide-up
  // ========================================
  document
    .querySelectorAll("[data-animate='word-reveal']")
    .forEach((element) => {
      const eyebrow = getEyebrowContext(element);
      const textEl = eyebrow ? eyebrow.textEl : element;

      setAccessibleSplitText(textEl);

      if (prefersReducedMotion) {
        instantReveal(element);
        if (eyebrow) instantReveal(eyebrow.marker);
        return;
      }

      const split = SplitText.create(textEl.children, {
        type: "words, chars",
        mask: "words",
        wordsClass: "word",
        charsClass: "char",
      });

      textEl.querySelectorAll(".word, .char").forEach((el) => {
        el.setAttribute("aria-hidden", "true");
      });

      gsap.set(split.words, { yPercent: 110 });

      const scrollTriggerConfig = {
        trigger: eyebrow ? eyebrow.layout : element,
        start: "top 80%",
        toggleActions: getToggleActions(element),
      };

      gsap.to(split.words, {
        yPercent: 0,
        delay: TIMINGS.wordReveal.delay,
        duration: TIMINGS.wordReveal.duration,
        stagger: { amount: TIMINGS.wordReveal.stagger },
        ease: TIMINGS.wordReveal.ease,
        scrollTrigger: scrollTriggerConfig,
      });

      if (eyebrow) {
        animateMarker(eyebrow.marker, {
          from: getDirectionFrom("word-reveal"),
          scrollTriggerConfig,
        });
      }

      gsap.set(element, { visibility: "visible" });
      if (eyebrow) gsap.set(eyebrow.marker, { visibility: "visible" });
    });

  // ========================================
  // PAN LEFT
  // ========================================
  document
    .querySelectorAll("[data-animate='pan-left']")
    .forEach((element) => {
      if (prefersReducedMotion) {
        instantReveal(element);
        return;
      }

      gsap.fromTo(
        element,
        { xPercent: PAN.distance },
        {
          xPercent: -PAN.distance,
          scrollTrigger: {
            trigger: element,
            start: "top bottom",
            end: "bottom top",
            scrub: 1,
          },
        }
      );

      gsap.set(element, { visibility: "visible" });
    });

  // ========================================
  // PAN RIGHT
  // ========================================
  document
    .querySelectorAll("[data-animate='pan-right']")
    .forEach((element) => {
      if (prefersReducedMotion) {
        instantReveal(element);
        return;
      }

      gsap.fromTo(
        element,
        { xPercent: -PAN.distance },
        {
          xPercent: PAN.distance,
          scrollTrigger: {
            trigger: element,
            start: "top bottom",
            end: "bottom top",
            scrub: 1,
          },
        }
      );

      gsap.set(element, { visibility: "visible" });
    });

  // ========================================
  // SCROLL-SCRUB — Character opacity
  // ========================================
  document
    .querySelectorAll("[data-animate='scroll-scrub']")
    .forEach((element) => {
      const eyebrow = getEyebrowContext(element);
      const textEl = eyebrow ? eyebrow.textEl : element;

      setAccessibleSplitText(textEl);

      if (prefersReducedMotion) {
        instantReveal(element);
        if (eyebrow) instantReveal(eyebrow.marker);
        return;
      }

      const split = SplitText.create(textEl.children, {
        type: "lines, words, chars",
        linesClass: "line",
        wordsClass: "word",
        charsClass: "char",
      });

      textEl.querySelectorAll(".line, .word, .char").forEach((el) => {
        el.setAttribute("aria-hidden", "true");
      });

      const scrollTriggerConfig = {
        trigger: eyebrow ? eyebrow.layout : element,
        start: "top 50%",
        end: "top 25%",
        scrub: 0.5,
      };

      gsap.fromTo(
        split.chars,
        { opacity: TIMINGS.scrollScrub.startOpacity },
        {
          opacity: 1,
          stagger: TIMINGS.scrollScrub.stagger,
          scrollTrigger: scrollTriggerConfig,
        }
      );

      if (eyebrow) {
        gsap.fromTo(
          eyebrow.marker,
          { opacity: TIMINGS.scrollScrub.startOpacity },
          {
            opacity: 1,
            scrollTrigger: scrollTriggerConfig,
          }
        );
      }

      gsap.set(element, { visibility: "visible" });
      if (eyebrow) gsap.set(eyebrow.marker, { visibility: "visible" });
    });

  // ========================================
  // FADE IN — Default (up)
  // ========================================
  document
    .querySelectorAll("[data-animate='fade-in']")
    .forEach((element) => {
      const eyebrow = getEyebrowContext(element);

      if (prefersReducedMotion) {
        instantReveal(element);
        if (eyebrow) instantReveal(eyebrow.marker);
        return;
      }

      const scrollTriggerConfig = {
        trigger: eyebrow ? eyebrow.layout : element,
        start: "top 80%",
        toggleActions: getToggleActions(element),
      };

      gsap.fromTo(
        element,
        { opacity: 0, y: "4rem" },
        {
          opacity: 1,
          y: 0,
          duration: TIMINGS.content.duration,
          ease: TIMINGS.content.ease,
          scrollTrigger: scrollTriggerConfig,
        }
      );

      if (eyebrow) {
        animateMarker(eyebrow.marker, {
          from: getDirectionFrom("fade-in"),
          scrollTriggerConfig,
        });
      }

      gsap.set(element, { visibility: "visible" });
      if (eyebrow) gsap.set(eyebrow.marker, { visibility: "visible" });
    });

  // ========================================
  // FADE IN — Directional variants
  // ========================================
  const fadeAnimations = [
    {
      selector: "[data-animate='fade-in-bottom']",
      type: "fade-in-bottom",
      from: { y: "2rem" },
    },
    {
      selector: "[data-animate='fade-in-top']",
      type: "fade-in-top",
      from: { y: "-2rem" },
    },
    {
      selector: "[data-animate='fade-in-left']",
      type: "fade-in-left",
      from: { x: "-2rem" },
    },
    {
      selector: "[data-animate='fade-in-right']",
      type: "fade-in-right",
      from: { x: "2rem" },
    },
  ];

  fadeAnimations.forEach(({ selector, type, from }) => {
    document.querySelectorAll(selector).forEach((element) => {
      const eyebrow = getEyebrowContext(element);

      if (prefersReducedMotion) {
        instantReveal(element);
        if (eyebrow) instantReveal(eyebrow.marker);
        return;
      }

      const scrollTriggerConfig = {
        trigger: eyebrow ? eyebrow.layout : element,
        start: "top 80%",
        toggleActions: getToggleActions(element),
      };

      gsap.fromTo(
        element,
        { opacity: 0, ...from },
        {
          opacity: 1,
          x: 0,
          y: 0,
          duration: TIMINGS.content.duration,
          ease: TIMINGS.content.ease,
          scrollTrigger: scrollTriggerConfig,
        }
      );

      if (eyebrow) {
        animateMarker(eyebrow.marker, {
          from: getDirectionFrom(type),
          scrollTriggerConfig,
        });
      }

      gsap.set(element, { visibility: "visible" });
      if (eyebrow) gsap.set(eyebrow.marker, { visibility: "visible" });
    });
  });

  // ========================================
  // IMAGE — Fade in
  // ========================================
  document
    .querySelectorAll("[data-animate='image-fade-in']")
    .forEach((element) => {
      if (prefersReducedMotion) {
        instantReveal(element);
        return;
      }

      gsap.fromTo(
        element,
        { opacity: 0, y: "3rem" },
        {
          opacity: 1,
          y: 0,
          duration: TIMINGS.image.duration,
          ease: TIMINGS.image.ease,
          scrollTrigger: {
            trigger: element,
            start: "top 80%",
            toggleActions: getToggleActions(element),
          },
        }
      );

      gsap.set(element, { visibility: "visible" });
    });

  // ========================================
  // IMAGE — Circle expand
  // ========================================
  document
    .querySelectorAll("[data-animate='circle-expand']")
    .forEach((element) => {
      if (prefersReducedMotion) {
        instantReveal(element);
        return;
      }

      gsap.fromTo(
        element,
        { clipPath: `circle(${IMAGE.circleStartSize}% at 50% 50%)` },
        {
          clipPath: `circle(${IMAGE.circleEndSize}% at 50% 50%)`,
          scrollTrigger: {
            trigger: element,
            start: "top center",
            end: "center top",
            scrub: 1,
          },
        }
      );

      gsap.set(element, { visibility: "visible" });
    });

  // ========================================
  // GRID — Staggered children
  // ========================================
  document.querySelectorAll("[data-animate='grid']").forEach((element) => {
    if (prefersReducedMotion) {
      instantReveal(element);
      return;
    }

    let gridItems;

    if (element.classList.contains("w-dyn-items")) {
      gridItems = Array.from(element.children);
    } else {
      const collectionList = element.querySelector(".w-dyn-items");
      if (collectionList) {
        gridItems = Array.from(collectionList.children);
      } else {
        const firstChild = element.children[0];
        gridItems = firstChild ? Array.from(firstChild.children) : [];
      }
    }

    gsap.set(gridItems, { opacity: 0, y: "3rem" });

    gsap.to(gridItems, {
      opacity: 1,
      y: 0,
      duration: TIMINGS.grid.duration,
      stagger: { each: TIMINGS.grid.stagger },
      ease: TIMINGS.grid.ease,
      scrollTrigger: {
        trigger: element,
        start: "top 80%",
        toggleActions: getToggleActions(element),
      },
    });

    gsap.set(element, { visibility: "visible" });
  });

  // ========================================
  // DEBOUNCED SCROLLTRIGGER REFRESH
  // ========================================
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      ScrollTrigger.refresh();
    }, 250);
  });
});
