/// <reference lib="webworker" />

self.addEventListener("install", onInstall);
self.addEventListener("activate", onActivate);

self.addEventListener("message", onMessage);
self.addEventListener("fetch", onFetch);

const filesMap = new Map();

/**
 * On service worker install
 * @returns {void}
 */
function onInstall() {
  self.skipWaiting();
}

/**
 * On service worker activate
 * @param {ExtendableEvent} event
 * @returns {void}
 */
function onActivate(event) {
  event.waitUntil(self.clients.claim());
}

/**
 * On service worker message receive
 * @param {MessageEvent} event
 * @returns {void}
 */
async function onMessage(event) {
  const { data: message } = event;

  if (typeof message === "object" && "subject" in message) {
    if (
      message.subject === "new-file" &&
      "id" in message &&
      "name" in message &&
      "type" in message &&
      "size" in message &&
      "port" in message
    ) {
      const { id, name, size, port } = message;

      const url = `${self.registration.scope}file/${name}?id=${id}`;

      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();

      port.onmessage = async (event) => {
        const { data } = event;

        if (typeof data === "string") {
          if (data === "close") {
            // await writable.close();
            try {
              await writer.close();
            } catch {}

            filesMap.delete(id);
          }
        } else if (data instanceof Uint8Array) {
          await writer.write(data);
        }
      };

      filesMap.set(id, {
        id,
        url,
        name,
        size,
        port,
        stream: readable,
      });

      port.postMessage({ subject: "download-url", url });
    }
  } else if (typeof message === "string") {
    if (message === "ping") return;
  }
}

/**
 * Listen to client fetch and routing events
 * @param {FetchEvent} event
 * @returns {void}
 */
function onFetch(event) {
  const { url: requestUrl } = event.request;

  const { pathname, searchParams } = new URL(requestUrl);
  if (pathname.startsWith("/file")) {
    const id = searchParams.get("id");

    const file = filesMap.get(id);
    if (!file) return null;

    const port = file.port;
    port.postMessage({ subject: "start" });

    const response = new Response(file.stream, {
      headers: {
        "Content-Type": `${file.type}; charset=utf-8`,
        "Content-Disposition":
          "attachment; filename*=UTF-8''" +
          encodeURIComponent(file.name)
            .replace(/['()]/g, escape)
            .replace(/\*/g, "%2A"),
        "Content-Length": file.size,
      },
    });

    event.respondWith(response);
  }
}
