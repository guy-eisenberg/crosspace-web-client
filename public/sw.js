/// <reference lib="webworker" />

self.addEventListener("install", onInstall);
self.addEventListener("activate", onActivate);

self.addEventListener("message", onMessage);
self.addEventListener("fetch", onFetch);

const contexts = new Map();

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
      message.subject === "new-transfer" &&
      "transfer" in message &&
      "port" in message
    ) {
      const { transfer, port } = message;

      const url = `${self.registration.scope}transfer/${transfer.id}`;

      const db = await getDB();

      const stream = new ReadableStream({
        start(controller) {
          let started = false;

          port.onmessage = (ev) => {
            const message = ev.data;

            if (message === "stream-start-approve" && !started) {
              started = true;

              port.postMessage({ subject: "debug", data: "stream-start" });

              const transaction = db.transaction(OBJECT_STORE_NAME, "readonly");
              const objectStore = transaction.objectStore(OBJECT_STORE_NAME);

              const keyRange = IDBKeyRange.bound(
                `${transfer.id}_`,
                `${transfer.id}_` + "\uffff",
                false,
                false,
              );
              const request = objectStore.openCursor(keyRange);

              request.onsuccess = () => {
                const cursor = request.result;

                if (cursor) {
                  const data = cursor.value.data;

                  port.postMessage({ subject: "debug", data: "data enqueue" });

                  controller.enqueue(new Uint8Array(data));

                  cursor.continue();
                } else {
                  port.postMessage({ subject: "debug", data: "close" });

                  // For some reason, Safari-IOS < 18.5 thinks he's a big shot, and prefers to close the stream itself:
                  if (!isIOSSafariBelow18_5()) controller.close();
                }
              };
            }
          };
        },
      });

      contexts.set(transfer.id, { transfer, url, port, stream });

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
  if (pathname.startsWith("/transfer")) {
    const id = pathname.split("/")[2];

    const context = contexts.get(id);
    if (!context) return null;

    const file = context.transfer.file;

    const response = new Response(context.stream, {
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
async function getDB() {
  const request = indexedDB.open(DB_NAME);

  return new Promise((res, rej) => {
    request.onsuccess = () => {
      res(request.result);
    };

    request.onerror = rej;
  });
}

const DB_NAME = "transfers_db";
const OBJECT_STORE_NAME = "transfers_chunks";

function isIOSSafariBelow18_5() {
  const userAgent = navigator.userAgent;

  // Check if it's iOS device
  const isIOS = /iPad|iPhone|iPod/.test(userAgent);
  if (!isIOS) return false;

  // Check if it's Safari (not Chrome or other browsers on iOS)
  const isSafari =
    /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS/.test(userAgent);
  if (!isSafari) return false;

  // Extract iOS version
  const iosVersionMatch = userAgent.match(/OS (\d+)_(\d+)/);
  if (!iosVersionMatch) return false;

  const majorVersion = parseInt(iosVersionMatch[1]);
  const minorVersion = parseInt(iosVersionMatch[2]);

  // iOS version below 18.5
  return majorVersion < 18 || (majorVersion === 18 && minorVersion < 5);
}
