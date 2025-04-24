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
      const { id, name, type, size, port } = message;

      const url = `${self.registration.scope}file/${id}`;

      const db = await initDB();

      const stream = new ReadableStream({
        start(controller) {
          let started = false;

          port.onmessage = (ev) => {
            const message = ev.data;

            if (message === "stream-start-approve" && !started) {
              started = true;

              port.postMessage({ subject: "debug", data: "stream-start" });

              const transaction = db.transaction("files_chunkes", "readonly");
              const objectStore = transaction.objectStore("files_chunkes");
              const request = objectStore.openCursor();

              request.onsuccess = () => {
                const cursor = request.result;

                if (cursor) {
                  const data = cursor.value.data;

                  port.postMessage({ subject: "debug", data: "data enqueue" });

                  controller.enqueue(new Uint8Array(data));

                  cursor.continue();
                } else {
                  port.postMessage({ subject: "debug", data: "close" });

                  const isSafariIOS =
                    /^((?!chrome|android).)*safari/i.test(
                      navigator.userAgent,
                    ) && /iPad|iPhone|iPod/.test(navigator.userAgent);

                  // For some reason, Safari-IOS thinks he's a big shot, and prefers to close the stream itself:
                  if (!isSafariIOS) controller.close();
                }
              };
            }
          };
        },
      });

      filesMap.set(id, {
        id,
        url,
        name,
        type,
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

  const { pathname } = new URL(requestUrl);
  if (pathname.startsWith("/file")) {
    const id = pathname.split("/")[2];

    const file = filesMap.get(id);
    if (!file) return null;

    const response = new Response(file.stream, {
      headers: {
        "Content-Type": "application/octet-stream; charset=utf-8",
        "Content-Disposition":
          "attachment; filename*=UTF-8''" +
          encodeURIComponent(file.name)
            .replace(/['()]/g, escape)
            .replace(/\*/g, "%2A"),
        "Content-Length": file.size,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });

    event.respondWith(response);
  }
}

/**
 *
 * @returns {Promise<IDBDatabase>}
 */
async function initDB() {
  const request = indexedDB.open("files_chunkes_db", 1);

  return new Promise((res, rej) => {
    request.onupgradeneeded = () => {
      const db = request.result;

      db.createObjectStore("files_chunkes", {
        autoIncrement: true,
      });
    };

    request.onsuccess = () => {
      res(request.result);
    };

    request.onerror = rej;
  });
}
