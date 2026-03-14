const DEBUG_PORT = Number(process.env.GPTICKER_DEBUG_PORT || 9222);
const TARGET_URL_PREFIX = process.env.GPTICKER_TARGET_URL || "https://chatgpt.com";
const HOST_ID = "gpticker-host";

const target = await waitForTarget();
const client = await createCdpClient(target.webSocketDebuggerUrl);

await client.send("Page.enable");
await client.send("Runtime.enable");

await waitForPageReady(client);

const initialDiagnostics = await readDiagnostics(client);
console.log("Initial diagnostics");
console.log(JSON.stringify(initialDiagnostics, null, 2));

await injectProbeMutation(client);
await delay(1500);

const postProbeDiagnostics = await readDiagnostics(client);
console.log("Post-probe diagnostics");
console.log(JSON.stringify(postProbeDiagnostics, null, 2));

await client.close();

async function waitForTarget() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`);
    const targets = await response.json();
    const pageTarget = targets.find(
      (entry) =>
        entry.type === "page" &&
        typeof entry.url === "string" &&
        entry.url.startsWith(TARGET_URL_PREFIX)
    );

    if (pageTarget) {
      return pageTarget;
    }

    await delay(1000);
  }

  throw new Error(`No target found for ${TARGET_URL_PREFIX} on port ${DEBUG_PORT}.`);
}

async function createCdpClient(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  let nextId = 1;

  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, {
      once: true
    });
    socket.addEventListener(
      "error",
      (event) => {
        reject(event.error ?? new Error("Failed to connect to Chrome DevTools."));
      },
      { once: true }
    );
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));

    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);

      if (message.error) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result);
      }
    }
  });

  return {
    send(method, params = {}) {
      const id = nextId++;

      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() {
      socket.close();
    }
  };
}

async function waitForPageReady(client) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const { result } = await client.send("Runtime.evaluate", {
      expression: `(() => {
        const host = document.getElementById("${HOST_ID}");
        return {
          readyState: document.readyState,
          hasHost: Boolean(host),
          hasMain: Boolean(document.querySelector("main")),
          loaderError:
            document.documentElement.getAttribute("data-gpticker-loader-error"),
          url: location.href
        };
      })()`,
      returnByValue: true
    });

    if (result?.value?.hasHost) {
      await delay(1000);
      return;
    }

    if (result?.value?.loaderError) {
      throw new Error(
        `GPTicker loader failed before host mount: ${result.value.loaderError}`
      );
    }

    await delay(1000);
  }

  throw new Error("GPTicker host node did not appear on the page.");
}

async function readDiagnostics(client) {
  const { result } = await client.send("Runtime.evaluate", {
    expression: `(() => {
      const host = document.getElementById("${HOST_ID}");
      const diagnostics = host?.getAttribute("data-gpticker-diagnostics");
      return {
        url: location.href,
        title: document.title,
        hasHost: Boolean(host),
        loaderError:
          document.documentElement.getAttribute("data-gpticker-loader-error"),
        scans: host?.getAttribute("data-gpticker-observer-scans") ?? null,
        lastNodeCount: host?.getAttribute("data-gpticker-last-node-count") ?? null,
        diagnostics: diagnostics ? JSON.parse(diagnostics) : null
      };
    })()`,
    returnByValue: true
  });

  return result?.value ?? null;
}

async function injectProbeMutation(client) {
  await client.send("Runtime.evaluate", {
    expression: `(() => {
      const main = document.querySelector("main") ?? document.body;

      if (!main) {
        return { injected: false, reason: "no-main" };
      }

      const probe = document.createElement("div");
      probe.id = "gpticker-probe";
      probe.textContent = "probe";
      probe.setAttribute("data-gpticker-probe", "true");
      main.appendChild(probe);
      setTimeout(() => probe.remove(), 120);

      return { injected: true, mainTag: main.tagName.toLowerCase() };
    })()`,
    returnByValue: true
  });
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
