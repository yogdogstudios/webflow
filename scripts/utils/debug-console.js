/**
 * Staging Debug Console
 * Outputs template info, environment checks, GSAP plugins,
 * component counts, and animation breakdowns
 * Only runs on .webflow.io staging URLs
 */
if (window.location.hostname.includes(".webflow.io")) {
  document.addEventListener("DOMContentLoaded", () => {
    const template = {
      name: "Starter Template",
      version: "1.0.0",
    };

    const checks = {
      gsap: typeof window.gsap !== "undefined",
      jsEnabled: document.documentElement.classList.contains("js-enabled"),
      animations: document.body.dataset.animations !== "false",
      headingCheck: document.body.dataset.headingCheck === "true",
    };

    const components = {
      accordions: document.querySelectorAll(".accordion_wrap").length,
      tabs: document.querySelectorAll(".tab_wrap").length,
      sliders: document.querySelectorAll(
        ".slider_wrap[data-slider='component']"
      ).length,
      animatedElements: document.querySelectorAll("[data-animate]").length,
    };

    const sectionStyle = "font-weight: bold; text-decoration: underline;";

    console.groupCollapsed(
      `%c ${template.name} v${template.version} `,
      "background: #111; color: #fff; padding: 4px 8px; border-radius: 4px; font-weight: bold;"
    );

    // Environment
    console.log("%cEnvironment", sectionStyle);
    Object.entries(checks).forEach(([key, value]) => {
      console.log(`  ${value ? "✅" : "❌"} ${key}`);
    });

    // GSAP Plugins
    if (checks.gsap) {
      const requestedPlugins =
        document
          .querySelector("[data-gsap-load]")
          ?.getAttribute("data-gsap-load")
          ?.split(",")
          .map((p) => p.trim()) || [];

      console.log("%cGSAP Plugins", sectionStyle);
      console.log(`  GSAP core: ✅ v${gsap.version}`);

      if (requestedPlugins.length > 0) {
        requestedPlugins.forEach((plugin) => {
          const loaded = !!(gsap[plugin] || window[plugin]);
          console.log(`  ${plugin}: ${loaded ? "✅" : "❌ not found"}`);
        });
      } else {
        console.log("  No plugins requested via data-gsap-load");
      }
    }

    // Components
    console.log("%cComponents", sectionStyle);
    const activeComponents = Object.entries(components).filter(
      ([, count]) => count > 0
    );
    if (activeComponents.length > 0) {
      activeComponents.forEach(([key, count]) => {
        console.log(`  ${key}: ${count}`);
      });
    } else {
      console.log("  None detected on this page");
    }

    // Animations breakdown
    if (components.animatedElements > 0) {
      const animTypes = {};
      document.querySelectorAll("[data-animate]").forEach((el) => {
        const type = el.dataset.animate || "unset";
        animTypes[type] = (animTypes[type] || 0) + 1;
      });

      console.log("%cAnimations", sectionStyle);
      Object.entries(animTypes).forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`);
      });
    }

    console.groupEnd();
  });
}
