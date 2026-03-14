(() => {
  const moduleUrl = chrome.runtime.getURL("content.js");

  import(moduleUrl).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    document.documentElement?.setAttribute("data-gpticker-loader-error", message);
    console.error("[GPTicker] Failed to load content module.", error);
  });
})();
