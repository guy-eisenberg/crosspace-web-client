"use client";

import { isSafariIOS } from "@/utils/isSafariIOS";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type FileWriter = {
  write: (data: Uint8Array) => void;
  close: () => void;
};

const SWContext = createContext<{
  downloadFile: (file: {
    id: string;
    name: string;
    type: string;
    size: number;
  }) => void;
}>({
  downloadFile() {},
});

export default function SWProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [init, setInit] = useState(false);

  const downloadFile = useCallback(
    (file: { id: string; name: string; type: string; size: number }) => {
      const { id, name, type, size } = file;

      const messageChannel = new MessageChannel();

      messageChannel.port1.onmessage = async (event) => {
        const message = event.data as
          | {
              subject: "debug";
              data: string;
            }
          | {
              subject: "download-url";
              url: string;
            };

        switch (message.subject) {
          case "debug":
            console.log(message.data);

            break;
          case "download-url":
            const { url } = message;

            location.href = url;

            if (isSafariIOS()) {
              window.onblur = () => {
                window.onfocus = () => {
                  messageChannel.port1.postMessage("stream-start-approve");

                  window.onfocus = null;
                };

                window.onblur = null;
              };
            } else {
              messageChannel.port1.postMessage("stream-start-approve");
            }

            break;
        }
      };

      if (!navigator.serviceWorker.controller)
        throw new Error("Service worker controller not found.");

      navigator.serviceWorker.controller.postMessage(
        {
          subject: "new-file",
          id,
          name,
          type,
          size,
          port: messageChannel.port2,
        },
        [messageChannel.port2],
      );
    },
    [],
  );

  useEffect(() => {
    if ("serviceWorker" in navigator) init();

    async function init() {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) await reg.unregister();

      await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      });

      setInit(true);
    }
  }, []);

  if (!init) return null;

  return (
    <SWContext.Provider value={{ downloadFile }}>{children}</SWContext.Provider>
  );
}

export function useSW() {
  return useContext(SWContext);
}
