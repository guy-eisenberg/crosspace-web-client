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
import { type FileWriter, useSW } from "./SWContext";

export type RTCConnection = {
  targetDevice: string;
  connection: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
  state: "connecting" | "connected" | "error";
};

export type RTCTransfer = {
  id: string;
  device: string;
  size: number;
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

const connections: {
  [id: string]: RTCConnection;
} = {};

let currentTransfer: RTCTransfer | null = null;
let currentWriter: FileWriter | null = null;

// let currentWriter: FileWriter;
// let currentTransferId: string | null = null;
// let currentTotalTransferSize = 0;
// let currentTransferedBytes = 0;

export default function ConnectionsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { createWriteStream } = useSW();
  const { getOwnedFile } = useFiles();

  const [init, setInit] = useState(false);

  const [state, setState] = useState<"connecting" | "idle" | "transfer">(
    "idle",
  );

  const [progress, setProgress] = useState(0);
  const [rate, setRate] = useState(0);

  const finishTransfer = useCallback(() => {
    setProgress(0);
    setRate(0);
    setState(allConnected() ? "idle" : "connecting");

    currentTransfer = null;
  }, []);

  const startTransfer = useCallback(
    (data: {
      transferId: string;
      targetDevice: string;
      metadata: Omit<FileMetadata, "url">;
    }) => {
      const { transferId, targetDevice, metadata } = data;

      currentTransfer = {
        id: transferId,
        device: targetDevice,
        size: metadata.size,
        transferedBytes: 0,
        status: "ongoing",
      };

      setProgress(0);
      setRate(0);
      setState("transfer");
    },
    [],
  );

  const processMessages = useCallback(
    async (originDevice: string, message: MessageEvent) => {
      if (message.data instanceof ArrayBuffer) {
        if (
          currentTransfer &&
          currentWriter &&
          currentTransfer.status === "ongoing"
        ) {
          const { data } = message;

          await currentWriter.write(new Uint8Array(data));

          currentTransfer.transferedBytes += data.byteLength;

          if (currentTransfer.transferedBytes >= currentTransfer.size) {
            console.log(
              "Finished transfer:",
              currentTransfer.id,
              "of size:",
              currentTransfer.size,
            );

            await currentWriter.close();
            currentWriter = null;

            finishTransfer();
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

          currentWriter = createWriteStream({
            id,
            name,
            type,
            size,
            async onClose() {
              io().emit("file-transfer-cancel", {
                targetDevice: originDevice,
                transferId,
              });

              finishTransfer();
            },
          });

          startTransfer({
            transferId,
            targetDevice: originDevice,
            metadata: { id, type, name, size },
          });

          console.log("Starting reciving file:", id, "of size:", size);
        }
      }
    },
    [createWriteStream, startTransfer, finishTransfer],
  );

  const sendMessage = useCallback(
    (
      targetDevice: string,
      metadata: FileMetadata,
      blob: Blob,
      dataChannel: RTCDataChannel,
      startIndex = 0,
    ) => {
      if (!currentTransfer) return;

      let index = startIndex;
      let offset = index * CHUNK_SIZE;

      if (index === 0) {
        dataChannel.send(
          JSON.stringify({
            event: "start",
            transferId: currentTransfer.id,
            id: metadata.id,
            type: metadata.type,
            name: metadata.name,
            size: metadata.size,
          }),
        );
      }

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
            sendMessage(targetDevice, metadata, blob, dataChannel, index);

          return;
        }
      }

      // dataChannel.send(
      //   JSON.stringify({
      //     event: "done",
      //     id: metadata.id,
      //     type: metadata.type,
      //     name: metadata.name,
      //     size: metadata.size,
      //   }),
      // );

      finishTransfer();
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
            (currentTransfer!.transferedBytes / currentTransfer!.size) * 100,
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

      io().on("disconnect", () => {
        setState("connecting");
        io().connect();
      });

      io().on("connect", () => {
        if (allConnected()) setState("idle");
        setInit(true);
      });
    }
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

      const blob = getOwnedFile(file.id);

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

      startTransfer({
        transferId: v4(),
        targetDevice: originDevice,
        metadata: file,
      });
      sendMessage(originDevice, file, blob, dataChannel, 0);
    });

    io().on("file-transfer-cancel", async (message) => {
      const { transferId } = message as {
        transferId: string;
      };

      if (currentTransfer && currentTransfer.id === transferId) {
        finishTransfer();
      }
    });

    return () => {
      io().off("file-request");
      io().off("file-transfer-cancel");
    };
  }, [init, getOwnedFile, finishTransfer, startTransfer, sendMessage]);

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
