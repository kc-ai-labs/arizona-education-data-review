(function initNavGuard(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (!root) return;
  root.HeliosNavGuard = Object.freeze(api);
  if (root.document) {
    api.install(root.document, root);
  }
})(typeof window !== "undefined" ? window : null, function buildNavGuard() {
  const KNOWN_PAGE_PATHS = new Set([
    "/index",
    "/scatter",
    "/correlation-outliers",
    "/data-cleaning",
    "/validation",
    "/assessment-predictions",
    "/assessment-overview",
    "/summary-stats",
    "/methodology",
    "/definitions",
    "/raw-data"
  ]);

  function shouldHandleNavClick(event) {
    if (!event) return false;
    if (event.defaultPrevented) return false;
    if ((event.button ?? 0) !== 0) return false;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
    return true;
  }

  function normalizeKnownPath(pathname) {
    if (!pathname) return pathname;
    if (pathname === "/") return "/index.html";
    if (pathname.endsWith(".html")) return pathname;
    if (KNOWN_PAGE_PATHS.has(pathname)) return `${pathname}.html`;
    return pathname;
  }

  function resolveNavHref(rawHref, baseHref) {
    if (!rawHref || !baseHref) return null;
    let url;
    try {
      url = new URL(rawHref, baseHref);
    } catch {
      return null;
    }
    url.pathname = normalizeKnownPath(url.pathname);
    return url.href;
  }

  function install(doc, root) {
    const tabs = doc.querySelector("header.top-nav nav.tabs");
    if (!tabs) return false;
    if (tabs.dataset.navGuardInstalled === "1") return true;

    tabs.addEventListener("click", event => {
      const anchor = event.target?.closest?.("a[href]");
      if (!anchor || !tabs.contains(anchor)) return;
      if (!shouldHandleNavClick(event)) return;
      if (anchor.target && anchor.target !== "_self") return;

      const currentHref = root.location?.href;
      const targetHref = resolveNavHref(anchor.getAttribute("href"), currentHref);
      if (!targetHref) return;

      let current;
      let target;
      try {
        current = new URL(currentHref);
        target = new URL(targetHref);
      } catch {
        return;
      }
      if (target.origin !== current.origin) return;

      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
      if (target.href === current.href) return;
      root.location.assign(target.href);
    }, true);

    tabs.dataset.navGuardInstalled = "1";
    return true;
  }

  return {
    install,
    resolveNavHref,
    shouldHandleNavClick
  };
});
