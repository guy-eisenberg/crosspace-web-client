"use client";

import LoadingScreen from "@/app/components/LoadingScreen";
import { api } from "@/clients/api";
import { io } from "@/clients/io";
import { FileMetadata } from "@/types";
import { cn } from "@heroui/theme";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { v4 } from "uuid";
import { useFiles } from "./FilesContext";
import { useSW } from "./SWContext";

export type RTCConnection = {
  targetDevice: string;
  connection: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
  state: "connecting" | "connected" | "error";
};

export type RTCTransfer = {
  id: string;
  device: string;
  file: Omit<FileMetadata, "url">;
  transferedBytes: number;
  status: "ongoing" | "closed";
};

export type ConnectionsState = "connecting" | "idle" | "transfer";

export type ConnectionsContextState = {
  state: ConnectionsState;
  progress: number;
  rate: number;
  connectTo: (deviceId: string) => Promise<void>;
};

const ConnectionsContext = createContext<ConnectionsContextState>({
  state: "idle",
  progress: 0,
  rate: 0,
  connectTo: async () => {},
});

let iceServers: RTCIceServer[] = [];
let db: IDBDatabase;

const pendingDbChunks: ArrayBuffer[] = [];

const connections: {
  [id: string]: RTCConnection;
} = {};

let currentWakeLock: WakeLockSentinel | null = null;
let currentTransfer: RTCTransfer | null = null;

export default function ConnectionsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { downloadFile } = useSW();
  const { getOwnedFile } = useFiles();

  const [init, setInit] = useState(false);

  const [state, setState] = useState<"connecting" | "idle" | "transfer">(
    "idle",
  );

  const [progress, setProgress] = useState(0);
  const [rate, setRate] = useState(0);

  const finishTransfer = useCallback(async () => {
    if (currentWakeLock)
      try {
        await currentWakeLock.release();
      } catch {}

    currentTransfer = null;
    currentWakeLock = null;

    setProgress(0);
    setRate(0);
    setState(allConnected() ? "idle" : "connecting");
  }, []);

  const startTransfer = useCallback(
    async (data: {
      transferId: string;
      targetDevice: string;
      metadata: Omit<FileMetadata, "url">;
    }) => {
      const { transferId, targetDevice, metadata } = data;

      currentTransfer = {
        id: transferId,
        device: targetDevice,
        file: metadata,
        transferedBytes: 0,
        status: "ongoing",
      };

      try {
        currentWakeLock = await navigator.wakeLock.request();
      } catch {}

      setProgress(0);
      setRate(0);
      setState("transfer");
    },
    [],
  );

  const processMessages = useCallback(
    async (originDevice: string, message: MessageEvent) => {
      if (message.data instanceof ArrayBuffer) {
        if (currentTransfer && currentTransfer.status === "ongoing") {
          const { data } = message;

          pendingDbChunks.push(data);

          // Each 64MB (4096 chunks), save the pending db chunks to disk:
          if (pendingDbChunks.length >= (64 * 1024 * 1024) / CHUNK_SIZE)
            await savePendingDbChunks();

          currentTransfer.transferedBytes += data.byteLength;

          if (currentTransfer.transferedBytes >= currentTransfer.file.size) {
            console.log(
              "Finished transfer:",
              currentTransfer.id,
              "of size:",
              currentTransfer.file.size,
            );

            if (pendingDbChunks.length > 0) await savePendingDbChunks();

            downloadFile(currentTransfer.file);

            await finishTransfer();
          }
        }
      } else {
        const { event, id, type, name, size, ...rest } = JSON.parse(
          message.data,
        ) as {
          event: "start";
          transferId: string;
          id: string;
          type: string;
          name: string;
          size: number;
        };

        if (event === "start") {
          const { transferId } = rest as { transferId: string };

          await startTransfer({
            transferId,
            targetDevice: originDevice,
            metadata: { id, type, name, size },
          });

          const transaction = db.transaction(["files_chunkes"], "readwrite");
          const objectStore = transaction.objectStore("files_chunkes");

          const request = objectStore.clear();
          await new Promise((res) => {
            request.onsuccess = res;
          });

          io().emit("file-transfer-start", {
            targetDevice: originDevice,
            transferId,
          });

          console.log("Starting reciving file:", id, "of size:", size);
        }
      }

      async function savePendingDbChunks() {
        const transaction = db.transaction(["files_chunkes"], "readwrite");
        const objectStore = transaction.objectStore("files_chunkes");

        const totalLength = pendingDbChunks.reduce(
          (total, chunk) => total + chunk.byteLength,
          0,
        );

        const dataArrayBuffer = new ArrayBuffer(totalLength);
        const dataView = new Uint8Array(dataArrayBuffer);

        const originalLength = pendingDbChunks.length;

        let offset = 0;
        for (let i = 0; i < originalLength; i++) {
          const chunk = pendingDbChunks.shift() as ArrayBuffer;

          dataView.set(new Uint8Array(chunk), offset);

          offset += chunk.byteLength;
        }

        const request = objectStore.put({ data: dataArrayBuffer });

        await new Promise((res) => {
          request.onsuccess = res;
        });
      }
    },
    [downloadFile, finishTransfer, startTransfer],
  );

  const sendFileData = useCallback(
    async (
      targetDevice: string,
      metadata: Omit<FileMetadata, "url">,
      blob: Blob,
      dataChannel: RTCDataChannel,
      startIndex = 0,
    ) => {
      if (!currentTransfer) return;

      let index = startIndex;
      let offset = index * CHUNK_SIZE;

      while (offset < blob.size) {
        if (dataChannel.bufferedAmount < MAX_BUFFER_SIZE) {
          const slice = blob.slice(offset, offset + CHUNK_SIZE);

          dataChannel.onbufferedamountlow = null;
          dataChannel.send(slice);

          currentTransfer.transferedBytes += slice.size;

          offset += CHUNK_SIZE;
          index += 1;
        } else {
          dataChannel.onbufferedamountlow = () =>
            sendFileData(targetDevice, metadata, blob, dataChannel, index);

          return;
        }
      }

      await finishTransfer();
      console.log("File transfer done.");
    },
    [finishTransfer],
  );

  const onDataChannelOpen = useCallback((device: string) => {
    console.log(`Data channel from ${device} is open.`);
    connections[device].state = "connected";

    setState((state) => {
      if (state === "transfer") return "transfer";
      else if (state === "connecting") if (allConnected()) return "idle";

      return "connecting";
    });
  }, []);

  const connectTo = useCallback(
    async (targetDevice: string) => {
      setState("connecting");

      try {
        console.log("A1. Trying to connect to device:", targetDevice);

        const connection = new RTCPeerConnection({ ...RTC_CONFIG, iceServers });

        const dataChannel = connection.createDataChannel("file-transfer", {
          ordered: true,
        });

        dataChannel.onopen = () => onDataChannelOpen(targetDevice);
        dataChannel.onmessage = processMessages.bind(null, targetDevice);
        dataChannel.bufferedAmountLowThreshold = LOW_BUFFER_SIZE;

        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);

        connection.onicecandidate = (event) => {
          if (event.candidate) {
            io().emit("new-ice-candidate", {
              targetDevice,
              candidate: event.candidate,
            });
          }
        };

        connections[targetDevice] = {
          targetDevice,
          connection,
          dataChannel,
          state: "connecting",
        };

        io().emit("connection-incoming", {
          targetDevice,
          offer,
        });
      } catch (err) {
        console.log(err);
      }
    },
    [onDataChannelOpen, processMessages],
  );

  useEffect(() => {
    if (state === "transfer") {
      const progressInterval = setInterval(() => {
        if (!currentTransfer) return;

        setProgress(
          Math.floor(
            (currentTransfer!.transferedBytes / currentTransfer!.file.size) *
              100,
          ),
        );
      }, 500);

      let lastRateIntervalBytes = 0;
      const rateInterval = setInterval(() => {
        if (!currentTransfer) return;

        const rate = currentTransfer.transferedBytes - lastRateIntervalBytes;

        lastRateIntervalBytes = currentTransfer.transferedBytes;

        setRate(rate);
      }, 1000);

      return () => {
        clearInterval(progressInterval);
        clearInterval(rateInterval);
      };
    }
  }, [state]);

  useEffect(() => {
    init();

    async function init() {
      const res = await api("/get-ice-servers");
      iceServers = (await res.json()) as RTCIceServer[];

      try {
        db = await initDB();
      } catch {
        throw new Error("IndexedDB init fail!");
      }

      io().on("disconnect", (reason) => {
        console.log("disconnected");
        setState("connecting");

        if (reason === "io server disconnect") {
          io().connect();
        }
      });

      io().on("connect", () => {
        console.log("connected");
        if (allConnected()) setState("idle");
        setInit(true);
      });
    }

    async function initDB() {
      const request = indexedDB.open("files_chunkes_db", 1);

      return new Promise<IDBDatabase>((res, rej) => {
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

    return () => {
      io().off("connect");
      io().off("disconnect");
    };
  }, []);

  useEffect(() => {
    if (!init) return;

    io().on("connection-incoming", async (message) => {
      setState("connecting");

      try {
        const { originDevice, offer } = message as {
          originDevice: string;
          offer: RTCSessionDescriptionInit;
        };

        console.log("P1. Connection incoming from:", originDevice);

        const connection = new RTCPeerConnection({ ...RTC_CONFIG, iceServers });

        connections[originDevice] = {
          targetDevice: originDevice,
          connection,
          dataChannel: null,
          state: "connecting",
        };

        connection.ondatachannel = (event) => {
          console.log(`P3. Recieved data channel from ${originDevice}`);

          const dataChannel = event.channel;

          dataChannel.onopen = () => onDataChannelOpen(originDevice);

          dataChannel.onmessage = processMessages.bind(null, originDevice);

          connections[originDevice] = {
            targetDevice: originDevice,
            connection,
            dataChannel,
            state: "connecting",
          };
        };

        connection.onicecandidate = (event) => {
          if (event.candidate) {
            io().emit("new-ice-candidate", {
              targetDevice: originDevice,
              candidate: event.candidate,
            });
          }
        };

        await connection.setRemoteDescription(new RTCSessionDescription(offer));

        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);

        io().emit("connection-accepted", {
          targetDevice: originDevice,
          answer,
        });

        console.log("P2. Accepted incoming connection from:", originDevice);
      } catch (err) {
        console.log(err);
      }
    });

    return () => {
      io().off("connection-incoming");
    };
  }, [init, onDataChannelOpen, processMessages]);

  useEffect(() => {
    if (!init) return;

    io().on("connection-accepted", async (message) => {
      try {
        const { originDevice, answer } = message as {
          originDevice: string;
          answer: RTCSessionDescriptionInit;
        };

        console.log("A2. Connection accepted from:", originDevice);

        await connections[originDevice].connection.setRemoteDescription(
          new RTCSessionDescription(answer),
        );
      } catch (err) {
        console.log(err);
      }
    });

    return () => {
      io().off("connection-accepted");
    };
  }, [init]);

  useEffect(() => {
    if (!init) return;

    io().on("new-ice-candidate", async (message) => {
      const { originDevice, candidate } = message as {
        originDevice: string;
        candidate: RTCIceCandidate;
      };

      console.log("New ice candidate from:", originDevice);

      await connections[originDevice].connection.addIceCandidate(candidate);
    });

    return () => {
      io().off("new-ice-candidate");
    };
  }, [init]);

  useEffect(() => {
    if (!init) return;

    io().on("file-request", async (message) => {
      const { originDevice, own, file } = message as {
        originDevice: string;
        own: boolean;
        file: FileMetadata;
      };

      console.log(`Device ${originDevice} requested file ${file.id}.`);

      if (own) {
        const a = document.createElement("a");
        a.href = file.url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();

        return;
      }

      const dataChannel = connections[originDevice].dataChannel;
      if (!dataChannel)
        throw new Error(`Data channel to ${originDevice} not found.`);

      await startTransfer({
        transferId: v4(),
        targetDevice: originDevice,
        metadata: file,
      });

      dataChannel.send(
        JSON.stringify({
          event: "start",
          transferId: currentTransfer!.id,
          id: file.id,
          type: file.type,
          name: file.name,
          size: file.size,
        }),
      );
    });

    io().on("file-transfer-start", async (message) => {
      const { transferId } = message as { transferId: string };

      if (currentTransfer && currentTransfer.id === transferId) {
        const dataChannel = connections[currentTransfer.device].dataChannel;
        if (!dataChannel)
          throw new Error(
            `Data channel to ${currentTransfer.device} not found.`,
          );

        const blob = getOwnedFile(currentTransfer.file.id);
        sendFileData(
          currentTransfer.device,
          currentTransfer.file,
          blob,
          dataChannel,
          0,
        );
      }
    });

    io().on("file-transfer-cancel", async (message) => {
      const { transferId } = message as {
        transferId: string;
      };

      if (currentTransfer && currentTransfer.id === transferId)
        await finishTransfer();
    });

    return () => {
      io().off("file-request");
      io().off("file-transfer-start");
      io().off("file-transfer-cancel");
    };
  }, [init, getOwnedFile, finishTransfer, startTransfer, sendFileData]);

  return (
    <ConnectionsContext.Provider
      value={{
        state,
        progress,
        rate,
        connectTo,
      }}
    >
      <div className="relative h-full w-full">
        {init ? children : null}
        <LoadingScreen
          className={cn(
            !init || state === "connecting" ? "opacity-100" : "-z-10 opacity-0",
          )}
        />
      </div>
    </ConnectionsContext.Provider>
  );

  function allConnected() {
    let allIdle = true;
    for (const connected of Object.values(connections)) {
      if (connected.state === "connecting") allIdle = false;
    }

    return allIdle;
  }
}

export function useConnections() {
  return useContext(ConnectionsContext);
}

const CHUNK_SIZE = 1024 * 16; // 16KB
const MAX_BUFFER_SIZE = 1024 * 1024 * 4; // 4MB
const LOW_BUFFER_SIZE = 1025 * 512; // 512KB

const RTC_CONFIG: RTCConfiguration = {
  iceTransportPolicy: "all",
};
