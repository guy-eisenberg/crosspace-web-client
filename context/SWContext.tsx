"use client";

import {
  ContextType,
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
  createWriteStream: (file: {
    id: string;
    name: string;
    type: string;
    size: number;
    onClose: () => Promise<void>;
  }) => Promise<FileWriter>;
}>({
  createWriteStream: (() => {}) as any,
});

export default function SWProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [init, setInit] = useState(false);

  const createWriteStream = useCallback(
    (file: {
      id: string;
      name: string;
      type: string;
      size: number;
      onClose: () => Promise<void>;
    }): ReturnType<ContextType<typeof SWContext>["createWriteStream"]> => {
      return new Promise((res) => {
        const { id, name, type, size } = file;

        const messageChannel = new MessageChannel();
        messageChannel.port1.onmessage = (event) => {
          const message = event.data as
            | {
                subject: "download-url";
                url: string;
              }
            | { subject: "start" }
            | {
                subject: "close";
              };

          switch (message.subject) {
            case "download-url":
              const { url } = message;

              location.href = url;

              break;
            case "start":
              res({
                write(data) {
                  messageChannel.port1.postMessage(data);
                },
                close() {
                  messageChannel.port1.postMessage("close");
                },
              });
              break;
            case "close":
              file.onClose();
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
      });
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
    <SWContext.Provider value={{ createWriteStream }}>
      {children}
    </SWContext.Provider>
  );
}

export function useSW() {
  return useContext(SWContext);
}
