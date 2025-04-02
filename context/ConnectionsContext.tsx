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

export type RTCConnection = {
  targetDevice: string;
  connection: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
  state: "connecting" | "connected" | "error";
};

export type ConnectionsState = "connecting" | "idle" | "transfer";

export type ConnectionsContextState = {
  state: ConnectionsState;
  progress: number;
  connectTo: (deviceId: string) => Promise<void>;
};

const ConnectionsContext = createContext<ConnectionsContextState>({
  state: "idle",
  progress: 0,
  connectTo: async () => {},
});

let iceServers: RTCIceServer[] = [];

const connections: {
  [id: string]: RTCConnection;
} = {};

let currentBuffer: ArrayBuffer[] = [];

let currentTransferSize = 0;

export default function ConnectionsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [init, setInit] = useState(false);

  const [state, setState] = useState<"connecting" | "idle" | "transfer">(
    "idle",
  );
  const [progress, setProgress] = useState(0);

  const processMessages = useCallback((message: MessageEvent) => {
    if (message.data instanceof ArrayBuffer) {
      currentBuffer.push(message.data);
      setProgress(
        (currentBuffer.length / Math.floor(currentTransferSize / CHUNK_SIZE)) *
          100,
      );
    } else {
      const { event, id, type, name, size } = JSON.parse(message.data) as {
        event: "start" | "done";
        id: string;
        type: string;
        name: string;
        size: number;
      };

      if (event === "start") {
        console.log("Starting reciving file:", id, "of size:", size);

        currentTransferSize = size;
        setProgress(0);
        setState("transfer");
      }

      if (event === "done") {
        console.log("Finished receiving file:", id, "of size:", size);

        const blob = new Blob(currentBuffer, { type });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();

        currentBuffer = [];

        currentTransferSize = 0;
        setProgress(100);
        setState(allConnected() ? "idle" : "connecting");
      }
    }
  }, []);

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

        const dataChannel = connection.createDataChannel("file-transfer");
        dataChannel.onopen = () => onDataChannelOpen(targetDevice);
        dataChannel.onmessage = processMessages;
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

          dataChannel.onmessage = processMessages;

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

        console.log(connections);
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

      const blob = await fetch(file.url).then((r) => r.blob());

      if (own) {
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();

        return;
      }

      const dataChannel = connections[originDevice].dataChannel;
      if (!dataChannel)
        throw new Error(`Data channel to ${originDevice} not found.`);

      readAndSendChunk(file, blob, dataChannel, 0);
    });

    return () => {
      io().off("file-request");
    };

    async function readAndSendChunk(
      metadata: FileMetadata,
      blob: Blob,
      dataChannel: RTCDataChannel,
      offset = 0,
    ) {
      const reader = new FileReader();
      const slice = blob.slice(offset, offset + CHUNK_SIZE);

      reader.onload = (e) => {
        const chunk = e.target?.result;

        if (chunk) {
          const newOffset = offset + (chunk as ArrayBuffer).byteLength;

          if (newOffset < blob.size) {
            if (offset === 0) {
              dataChannel.send(
                JSON.stringify({
                  event: "start",
                  id: metadata.id,
                  type: metadata.type,
                  name: metadata.name,
                  size: metadata.size,
                }),
              );
            }

            if (dataChannel.bufferedAmount < MAX_BUFFER_SIZE) {
              dataChannel.send(chunk as string);
              readAndSendChunk(metadata, blob, dataChannel, newOffset);
              dataChannel.onbufferedamountlow = null;
            } else {
              dataChannel.onbufferedamountlow = () =>
                readAndSendChunk(metadata, blob, dataChannel, offset);
            }
          } else {
            dataChannel.send(
              JSON.stringify({
                event: "done",
                id: metadata.id,
                type: metadata.type,
                name: metadata.name,
                size: metadata.size,
              }),
            );
            console.log("File transfer done.");
          }
        }
      };

      reader.readAsArrayBuffer(slice);
    }
  }, [init]);

  return (
    <ConnectionsContext.Provider
      value={{
        state,
        progress,
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

const CHUNK_SIZE = 1024 * 16;
const MAX_BUFFER_SIZE = 1024 * 1024 * 4;
const LOW_BUFFER_SIZE = 1025 * 512;

const RTC_CONFIG: RTCConfiguration = {
  iceTransportPolicy: "all",
};
