/**
 * Theme Toggle 1.2.0
 * Released under the MIT License
 */
function colorModeToggle() {
  function attr(defaultVal, attrVal) {
    var defaultValType = typeof defaultVal;
    if (typeof attrVal !== "string" || attrVal.trim() === "") return defaultVal;
    if (attrVal === "true" && defaultValType === "boolean") return true;
    if (attrVal === "false" && defaultValType === "boolean") return false;
    if (isNaN(attrVal) && defaultValType === "string") return attrVal;
    if (!isNaN(attrVal) && defaultValType === "number") return +attrVal;
    return defaultVal;
  }

  var htmlElement = document.documentElement;
  var toggleEls;
  var togglePressed = "false";

  var scriptTag = document.querySelector("[data-theme-toggle-script]");
  if (!scriptTag) {
    console.warn("Script tag with data-theme-toggle-script attribute not found");
    return;
  }

  var colorModeDuration = attr(0.5, scriptTag.getAttribute("duration"));
  var colorModeEase = attr("power1.out", scriptTag.getAttribute("ease"));

  function setColors(themeString, animate) {
    if (typeof gsap !== "undefined" && animate) {
      gsap.to(htmlElement, {
        ...colorThemes.getTheme(themeString),
        duration: colorModeDuration,
        ease: colorModeEase,
      });
    } else {
      htmlElement.classList.remove("u-theme-dark");
      htmlElement.classList.remove("u-theme-light");
      htmlElement.classList.add("u-theme-" + themeString);
    }
  }

  function goDark(dark, animate) {
    if (dark) {
      localStorage.setItem("dark-mode", "true");
      htmlElement.classList.add("dark-mode");
      setColors("dark", animate);
      togglePressed = "true";
    } else {
      localStorage.setItem("dark-mode", "false");
      htmlElement.classList.remove("dark-mode");
      setColors("light", animate);
      togglePressed = "false";
    }
    if (toggleEls) {
      toggleEls.forEach(function (element) {
        element.setAttribute("aria-pressed", togglePressed);
      });
    }
  }

  function checkPreference(e) {
    goDark(e.matches, false);
  }

  var colorPreference = window.matchMedia("(prefers-color-scheme: dark)");
  colorPreference.addEventListener("change", function (e) {
    checkPreference(e);
  });

  var storagePreference = localStorage.getItem("dark-mode");
  if (storagePreference !== null) {
    storagePreference === "true" ? goDark(true, false) : goDark(false, false);
  } else {
    checkPreference(colorPreference);
  }

  window.addEventListener("DOMContentLoaded", function () {
    toggleEls = document.querySelectorAll("[data-theme-toggle-button]");

    /* Set initial aria-pressed to match current state */
    toggleEls.forEach(function (element) {
      element.setAttribute("aria-pressed", togglePressed);
    });

    document.addEventListener("click", function (e) {
      var targetElement = e.target.closest("[data-theme-toggle-button]");
      if (targetElement) {
        var darkClass = htmlElement.classList.contains("dark-mode");
        darkClass ? goDark(false, true) : goDark(true, true);
      }
    });
  });
}
colorModeToggle();
