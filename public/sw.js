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
function onMessage(event) {
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

      const stream = new ReadableStream({
        start(controller) {
          port.postMessage({ subject: "start" });

          port.onmessage = (event) => {
            const { data } = event;

            if (typeof data === "string") {
              if (data === "close") {
                filesMap.delete(id);

                return controller.close();
              }
            } else if (data instanceof Uint8Array)
              return controller.enqueue(data);
          };
        },
        cancel: () => {
          filesMap.delete(id);

          port.postMessage({ subject: "close" });
        },
      });

      filesMap.set(id, {
        id,
        url,
        name,
        size,
        port,
        stream,
      });

      port.postMessage({ subject: "download-url", url });
    }
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
