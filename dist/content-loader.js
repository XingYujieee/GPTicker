(() => {
  const tryLoad = async (path) => {
    try {
      await import(chrome.runtime.getURL(path));
      return true;
    } catch (err) {
      return false;
    }
  };

  // 兼容旧版本（content.js）和新版打包输出（assets/content.js）
  (async () => {
    const ok = await tryLoad("assets/content.js");
    if (!ok) {
      const ok2 = await tryLoad("content.js");
      if (!ok2) {
        const message = "Failed to load content module: unknown path";
        document.documentElement?.setAttribute("data-gpticker-loader-error", message);
        console.error("[GPTicker] Failed to load content module.", message);
      }
    }
  })();
})();
