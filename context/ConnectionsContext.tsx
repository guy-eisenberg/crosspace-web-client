"use client";

import LoadingScreen from "@/app/components/LoadingScreen";
import { api } from "@/clients/api";
import { io } from "@/clients/io";
import {
  FileMetadata,
  RTCConnection,
  RTCTransferState,
  RTCTrasnfer,
} from "@/types";
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

export type ConnectionsContextState = {
  deviceId: string;
  connectionStates: {
    [deviceId: string]: RTCPeerConnectionState;
  };
  transferStates: {
    [id: string]: RTCTransferState;
  };
  connectTo: (deviceId: string) => Promise<void>;
  disconnectFrom: (deviceId: string) => void;
  requestFileTransfer: (data: { file: FileMetadata }) => Promise<RTCTrasnfer>;
  startTransfer: (transferId: string) => Promise<void>;
  pauseTransfer: (transferId: string) => Promise<void>;
  deleteTransfer: (transferId: string) => Promise<void>;
  getTransfer: (transferId: string) => RTCTrasnfer;
};

const ConnectionsContext = createContext<ConnectionsContextState>({
  deviceId: "",
  connectionStates: {},
  transferStates: {},
  connectTo: async () => {},
  disconnectFrom: () => {},
  requestFileTransfer: function (): Promise<RTCTrasnfer> {
    throw new Error("Function not implemented.");
  },
  startTransfer: function (): Promise<void> {
    throw new Error("Function not implemented.");
  },
  pauseTransfer: function (): Promise<void> {
    throw new Error("Function not implemented.");
  },
  deleteTransfer: function (): Promise<void> {
    throw new Error("Function not implemented.");
  },
  getTransfer: function () {
    throw new Error("Function not implemented.");
  },
});

let iceServers: RTCIceServer[] = [];
let db: IDBDatabase;

const pendingDbChunks: { [transferId: string]: ArrayBuffer[] } = {};

const connections: {
  [id: string]: RTCConnection;
} = {};

const pendingMessagesRes: { [messageId: string]: (data: any) => void } = {};

const transfers: { [id: string]: RTCTrasnfer } = {};
const deviceTransfers: { [deviceId: string]: { [id: string]: RTCTrasnfer } } =
  {};

let currentWakeLock: WakeLockSentinel | null = null;

export default function ConnectionsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { downloadFile } = useSW();
  const { getOwnedFile } = useFiles();

  const [init, setInit] = useState(false);

  const [deviceId, setDeviceId] = useState("");

  const [connectionStates, setConnectionStates] = useState<{
    [deviceId: string]: RTCPeerConnectionState;
  }>({});

  const [transferStates, setTransferStates] = useState<{
    [id: string]: RTCTransferState;
  }>({});

  const sendWithAck = useCallback(async function <T>({
    deviceId,
    event,
    data,
  }: {
    deviceId: string;
    event: string;
    data: any;
  }) {
    const messageId = v4();

    const dataChannel = getConnectionDataChannel(deviceId);
    dataChannel.send(
      JSON.stringify({
        messageId,
        event,
        data,
      }),
    );

    return await new Promise<T>((res) => {
      pendingMessagesRes[messageId] = res;
    });
  }, []);

  const sendAck = useCallback(
    ({
      deviceId,
      messageId,
      data,
    }: {
      deviceId: string;
      messageId: string;
      data: any;
    }) => {
      const dataChannel = getConnectionDataChannel(deviceId);
      dataChannel.send(
        JSON.stringify({
          messageId,
          event: "message-resolve",
          data,
        }),
      );
    },
    [],
  );

  const savePendingDbChunks = useCallback(async (transferId: string) => {
    const transaction = db.transaction(OBJECT_STORE_NAME, "readwrite");
    const objectStore = transaction.objectStore(OBJECT_STORE_NAME);

    const totalLength = pendingDbChunks[transferId].reduce(
      (total, chunk) => total + chunk.byteLength,
      0,
    );

    const dataArrayBuffer = new ArrayBuffer(totalLength);
    const dataView = new Uint8Array(dataArrayBuffer);

    const originalLength = pendingDbChunks[transferId].length;

    let offset = 0;
    for (let i = 0; i < originalLength; i++) {
      const chunk = pendingDbChunks[transferId].shift() as ArrayBuffer;

      dataView.set(new Uint8Array(chunk), offset);

      offset += chunk.byteLength;
    }

    const index = Math.floor(
      transfers[transferId].transferedBytes / DB_CHUNK_SIZE,
    );

    const request = objectStore.put({
      id: `${transferId}_${index}`,
      data: dataArrayBuffer,
    });

    await new Promise((res) => {
      request.onsuccess = res;
    });
  }, []);

  const processRTCMessages = useCallback(
    async (originDeviceId: string, message: MessageEvent) => {
      if (message.data instanceof ArrayBuffer) {
        const { transferId, buffer } = decodeTransferMessage(message.data);

        const transfer = transfers[transferId];
        if (!transfer) return;

        console.log(`Recieved chunk of transfer "${transfer.id}"`);

        if (!pendingDbChunks[transferId]) {
          pendingDbChunks[transferId] = [buffer];
        } else {
          pendingDbChunks[transferId].push(buffer);
        }

        // Each 64MB (4096 chunks of 16KB), save the pending db chunks to disk:
        if (pendingDbChunks[transferId].length >= DB_CHUNK_SIZE / CHUNK_SIZE)
          await savePendingDbChunks(transferId);

        transfer.transferedBytes += buffer.byteLength;

        if (transfer.transferedBytes >= transfer.file.size) {
          if (pendingDbChunks[transferId].length > 0)
            await savePendingDbChunks(transferId);

          console.log(`File transfer of id: "${transfer.id}" done.`);

          await sendWithAck({
            deviceId: originDeviceId,
            event: "transfer-done",
            data: { transferId },
          });

          setTransferStates((states) => ({ ...states, [transferId]: "done" }));

          downloadFile(transfer);
        }
      } else if (typeof message.data === "string") {
        const json = JSON.parse(message.data);

        const { messageId, event, data } = json as {
          messageId: string;
          event:
            | "message-resolve"
            | "get-transfers"
            | "file-request"
            | "transfer-start"
            | "transfer-pause"
            | "transfer-done"
            | "transfer-delete";
          data: any;
        };

        if (event === "message-resolve") {
          const res = pendingMessagesRes[messageId];
          if (res) res(data);
        } else if (event === "get-transfers") {
          const transfers = deviceTransfers[originDeviceId] || {};

          sendAck({
            deviceId: originDeviceId,
            messageId,
            data: transfers,
          });
        } else if (event === "file-request") {
          console.log(`Recieved file request from device "${originDeviceId}".`);

          const { file } = data as { file: FileMetadata };

          const transferId = v4();
          const transfer: RTCTrasnfer = {
            id: transferId,
            type: "out",
            deviceId: originDeviceId,
            file,
            transferedBytes: 0,
          };

          transfers[transferId] = transfer;
          deviceTransfers[originDeviceId] = {
            [transferId]: transfer,
          };

          setTransferStates((states) => ({ ...states, [transferId]: "init" }));

          sendAck({ deviceId: originDeviceId, messageId, data: transferId });
        } else if (event === "transfer-start") {
          const { transferId } = data as { transferId: string };

          console.log(
            `Recieved transfer start request - Device: "${originDeviceId}", Transfer: "${transferId}".`,
          );

          setTransferStates((states) => ({
            ...states,
            [transferId]: "ongoing",
          }));

          sendAck({ deviceId: originDeviceId, messageId, data: null });
        } else if (event === "transfer-pause") {
          const { transferId } = data as { transferId: string };

          console.log(
            `Recieved transfer pause request - Device: "${originDeviceId}", Transfer: "${transferId}".`,
          );

          setTransferStates((states) => ({
            ...states,
            [transferId]: "paused",
          }));

          sendAck({ deviceId: originDeviceId, messageId, data: null });
        } else if (event === "transfer-done") {
          const { transferId } = data as { transferId: string };

          console.log(
            `Recieved transfer done request - Device: "${originDeviceId}", Transfer: "${transferId}".`,
          );

          setTransferStates((states) => ({ ...states, [transferId]: "done" }));

          sendAck({ deviceId: originDeviceId, messageId, data: null });
        } else if (event === "transfer-delete") {
          const { transferId } = data as { transferId: string };

          console.log(
            `Recieved transfer delete request - Device: "${originDeviceId}", Transfer: "${transferId}".`,
          );

          delete transfers[transferId];
          setTransferStates((states) => {
            delete states[transferId];

            return { ...states };
          });

          sendAck({ deviceId: originDeviceId, messageId, data: null });
        }
      }
    },
    [sendAck, sendWithAck, savePendingDbChunks, downloadFile],
  );

  const sendTransferMessage = useCallback(
    async (transfer: RTCTrasnfer) => {
      const dataChannel = getConnectionDataChannel(transfer.deviceId);

      console.log(`Sending chunk of transfer "${transfer.id}".`);

      const blob = getOwnedFile(transfer.file.id);
      if (!blob)
        throw new Error(
          `Could not get owned file of id: "${transfer.file.id}"!`,
        );

      const slice = blob.slice(
        transfer.transferedBytes,
        transfer.transferedBytes + CHUNK_SIZE,
      );
      const buffer = await slice.arrayBuffer();

      const message = encodeTransferMessage({
        transferId: transfer.id,
        buffer,
      });
      dataChannel.send(message);

      transfer.transferedBytes += slice.size;
    },
    [getOwnedFile],
  );

  const onDataChannelOpen = useCallback(async (deviceId: string) => {
    console.log(`Data channel to device "${deviceId}" is open.`);
  }, []);

  const connectTo = useCallback(
    async (targetDeviceId: string) => {
      clearExistingConnection(targetDeviceId);

      console.log(`+1. Trying to connect to device "${targetDeviceId}"`);

      const createConnectionRes = await api(
        `/spaces/connection/${targetDeviceId}`,
        {
          method: "POST",
          body: JSON.stringify({
            event: "create-connection",
            data: {},
          }),
        },
      );

      if (!createConnectionRes.ok)
        throw new Error(
          `Device "${targetDeviceId}" could not create a connection.`,
        );

      console.log(`+2. Device "${targetDeviceId}" created a connection.`);

      const peer = createConnection(targetDeviceId);

      const dataChannel = peer.createDataChannel(DATA_CHANNEL_NAME);
      dataChannel.bufferedAmountLowThreshold = LOW_BUFFER_SIZE;

      dataChannel.onmessage = processRTCMessages.bind(null, targetDeviceId);
      dataChannel.onopen = onDataChannelOpen.bind(null, targetDeviceId);

      connections[targetDeviceId].dataChannel = dataChannel;

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      console.log(`+3. Sending an offer to device ${targetDeviceId}.`);

      const sendOfferRes = await api(`/spaces/connection/${targetDeviceId}`, {
        method: "POST",
        body: JSON.stringify({
          event: "send-offer",
          data: offer,
        }),
      });

      if (!sendOfferRes.ok)
        throw new Error(`Device "${targetDeviceId}" could not send an answer.`);

      console.log(`+4. Received an answer from device "${targetDeviceId}".`);

      const answer = await sendOfferRes.json();

      try {
        await peer.setRemoteDescription(new RTCSessionDescription(answer));
      } catch {}

      await addPendingICECandidates(targetDeviceId);
    },
    [onDataChannelOpen, processRTCMessages],
  );

  const disconnectFrom = useCallback((targetDeviceId: string) => {
    const connection = connections[targetDeviceId];
    if (connection) {
      console.log(`Disconnecting from device "${targetDeviceId}"`);

      connection.peer.close();
      delete connections[targetDeviceId];

      setConnectionStates((states) => {
        delete states[targetDeviceId];

        return states;
      });
    }
  }, []);

  const requestFileTransfer = useCallback(
    async ({ file }: { file: FileMetadata }) => {
      const transferId = await sendWithAck<string>({
        deviceId: file.deviceId,
        event: "file-request",
        data: { file },
      });

      const transfer: RTCTrasnfer = {
        id: transferId,
        type: "in",
        deviceId: file.deviceId,
        file,
        transferedBytes: 0,
      };

      transfers[transferId] = transfer;
      deviceTransfers[file.deviceId] = {
        [transferId]: transfer,
      };

      setTransferStates((states) => ({ ...states, [transferId]: "init" }));

      return transfers[transferId];
    },
    [sendWithAck],
  );

  const startTransfer = useCallback(
    async (transferId: string) => {
      const transfer = transfers[transferId];
      if (!transfer) return;

      try {
        await sendWithAck({
          deviceId: transfer.deviceId,
          event: "transfer-start",
          data: { transferId },
        });
      } catch (e) {
        console.log(e);
      }

      setTransferStates((states) => ({ ...states, [transferId]: "ongoing" }));
    },
    [sendWithAck],
  );

  const pauseTransfer = useCallback(
    async (transferId: string) => {
      const transfer = transfers[transferId];
      if (!transfer) return;

      try {
        await sendWithAck({
          deviceId: transfer.deviceId,
          event: "transfer-pause",
          data: { transferId },
        });
      } catch (e) {
        console.log(e);
      }

      setTransferStates((states) => ({ ...states, [transferId]: "paused" }));
    },
    [sendWithAck],
  );

  const deleteTransfer = useCallback(
    async (transferId: string) => {
      const transfer = transfers[transferId];
      if (!transfer) return;

      console.log("Sending delete transfer.");

      try {
        await sendWithAck({
          deviceId: transfer.deviceId,
          event: "transfer-delete",
          data: { transferId },
        });
      } catch (e) {
        console.log(e);
      }

      delete deviceTransfers[transfer.deviceId][transferId];
      delete transfers[transferId];

      setTransferStates((states) => {
        delete states[transferId];

        return { ...states };
      });
    },
    [sendWithAck],
  );

  const getTransfer = useCallback((transferId: string) => {
    return transfers[transferId];
  }, []);

  useEffect(() => {
    init();

    async function init() {
      const initRes = await api("/init");

      if (!initRes.ok) throw new Error("Failed to init ConnectionsContext!");

      const { deviceId, stunServers } = (await initRes.json()) as {
        deviceId: string;
        stunServers: RTCIceServer[];
      };

      stunServers.map((s) => s.urls);

      iceServers = stunServers;

      try {
        db = await initDB();
      } catch {
        throw new Error("Failed to init IndexedDB!");
      }

      io().on("disconnect", (reason) => {
        console.log("disconnect");

        setInit(false);

        if (reason === "io server disconnect") {
          io().connect();
        }
      });

      io().on("connect", () => {
        console.log("connect");

        setInit(true);
      });

      setDeviceId(deviceId);
    }

    async function initDB() {
      const request = indexedDB.open(DB_NAME);

      return new Promise<IDBDatabase>((res, rej) => {
        request.onupgradeneeded = () => {
          const db = request.result;

          db.createObjectStore(OBJECT_STORE_NAME, {
            keyPath: "id",
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

    io().on("create-connection", async (message, callback) => {
      const { originDeviceId } = message as { originDeviceId: string };

      clearExistingConnection(originDeviceId);

      const peer = createConnection(originDeviceId);

      peer.ondatachannel = (event) => {
        const dataChannel = event.channel;

        console.log(
          `-4. Received data channel from device "${originDeviceId}".`,
        );

        dataChannel.onmessage = processRTCMessages.bind(null, originDeviceId);
        dataChannel.onopen = onDataChannelOpen.bind(null, originDeviceId);

        connections[originDeviceId].dataChannel = dataChannel;
      };

      callback({});

      console.log(`-1. Created a connection to device "${originDeviceId}".`);
    });

    io().on("send-offer", async (message, callback) => {
      const { originDeviceId, data: offer } = message as {
        originDeviceId: string;
        data: RTCSessionDescriptionInit;
      };

      console.log(`-2. Offer incoming from device "${originDeviceId}".`);

      const peer = getConnection(originDeviceId);

      try {
        await peer.setRemoteDescription(new RTCSessionDescription(offer));
      } catch {}

      await addPendingICECandidates(originDeviceId);

      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      callback(answer);

      console.log(`-3. Sent answer to device "${originDeviceId}".`);
    });

    io().on("ice-candidate", async (message, callback) => {
      const { originDeviceId, data: candidate } = message as {
        originDeviceId: string;
        data: RTCIceCandidate;
      };

      console.log("± New ice candidate from:", originDeviceId);

      if (connections[originDeviceId].peer.remoteDescription) {
        await connections[originDeviceId].peer.addIceCandidate(candidate);
      } else {
        connections[originDeviceId].pendingCandidates.push(candidate);
      }

      callback({});
    });

    return () => {
      io().off("create-connection");
      io().off("send-offer");
      io().off("ice-candidate");
    };
  }, [init, onDataChannelOpen, processRTCMessages]);

  useEffect(() => {
    determineScreenLock();

    async function determineScreenLock() {
      const hasOngoingTransfers = Object.values(transferStates).some(
        (s) => s === "ongoing",
      );

      if (hasOngoingTransfers) await requestScreenLock();
      else await releaseScreenLock();
    }
  }, [transferStates]);

  useEffect(() => {
    let canceled = false;

    runOutTransfers();

    async function runOutTransfers() {
      let i = 0;
      let pendingOutTransfers = getPendingOutTransfers();

      while (!canceled && pendingOutTransfers.length > 0) {
        console.log("now");

        for (const transfer of pendingOutTransfers) {
          if (transfer.transferedBytes < transfer.file.size) {
            try {
              const dataChannel = getConnectionDataChannel(transfer.deviceId);

              if (dataChannel.bufferedAmount < MAX_BUFFER_SIZE)
                await sendTransferMessage(transfer);
            } catch {}
          }
        }

        if (i++ % 100 === 0)
          await new Promise<void>((res) => setTimeout(res, 0));

        pendingOutTransfers = getPendingOutTransfers();
      }
    }

    return () => {
      canceled = true;
    };

    function getPendingOutTransfers() {
      return Object.values(transfers).filter(
        (transfer) =>
          transfer.type === "out" && transferStates[transfer.id] === "ongoing",
      );
    }
  }, [sendTransferMessage, transferStates]);

  return (
    <ConnectionsContext.Provider
      value={{
        deviceId,
        connectionStates,
        transferStates,
        connectTo,
        disconnectFrom,
        requestFileTransfer,
        startTransfer,
        pauseTransfer,
        deleteTransfer,
        getTransfer,
      }}
    >
      <div className="relative h-full w-full">
        {init ? children : null}
        <LoadingScreen
          className={cn(!init ? "opacity-100" : "-z-10 opacity-0")}
        />
      </div>
    </ConnectionsContext.Provider>
  );

  async function addPendingICECandidates(deviceId: string) {
    for (const candidate of connections[deviceId].pendingCandidates) {
      await connections[deviceId].peer.addIceCandidate(candidate);
    }
  }

  function clearExistingConnection(deviceId: string) {
    for (const transferId of Object.keys(deviceTransfers[deviceId] || {})) {
      delete transfers[transferId];

      setTransferStates((states) => {
        delete states[transferId];

        return { ...states };
      });
    }

    delete deviceTransfers[deviceId];

    const connection = connections[deviceId];
    if (connection) {
      connection.peer.close();
      delete connections[deviceId];
    }
  }

  function createConnection(deviceId: string) {
    const peer = new RTCPeerConnection({ ...RTC_CONFIG, iceServers });

    connections[deviceId] = {
      targetDeviceId: deviceId,
      peer,
      dataChannel: null,
      pendingCandidates: [],
    };

    peer.onicecandidate = async (event) => {
      if (event.candidate) {
        console.log(`± Sending ICE candidate to device "${deviceId}".`);

        await api(`/spaces/connection/${deviceId}`, {
          method: "POST",
          body: JSON.stringify({
            event: "ice-candidate",
            data: event.candidate,
          }),
        });
      }
    };

    peer.addEventListener("connectionstatechange", () => {
      setConnectionStates((states) => {
        return {
          ...states,
          [deviceId]: peer.connectionState,
        };
      });
    });

    setConnectionStates((states) => {
      return {
        ...states,
        [deviceId]: peer.connectionState,
      };
    });

    return peer;
  }

  function getConnection(deviceId: string) {
    const connection = connections[deviceId];
    if (!connection)
      throw new Error(
        `Could not find open connection to device of id "${deviceId}"`,
      );

    return connection.peer;
  }

  function getConnectionDataChannel(deviceId: string) {
    const dataChannel = connections[deviceId].dataChannel;
    if (!dataChannel)
      throw new Error(`Could not find data-channel to device "${deviceId}".`);

    return dataChannel;
  }

  async function requestScreenLock() {
    if (currentWakeLock) return;

    try {
      currentWakeLock = await navigator.wakeLock.request();
    } catch {}
  }

  async function releaseScreenLock() {
    if (currentWakeLock)
      try {
        await currentWakeLock.release();
        currentWakeLock = null;
      } catch {}
  }

  function encodeTransferMessage({
    transferId,
    buffer,
  }: {
    transferId: string;
    buffer: ArrayBuffer;
  }) {
    const encoder = new TextEncoder();
    const idBytes = encoder.encode(transferId);

    const totalSize = 36 + buffer.byteLength; // 36 + blob size

    const message = new ArrayBuffer(totalSize);

    let offset = 0;

    new Uint8Array(message, offset, 36).set(idBytes);
    offset += 36;

    new Uint8Array(message, offset, buffer.byteLength).set(
      new Uint8Array(buffer),
    );
    offset += buffer.byteLength;

    return message;
  }

  function decodeTransferMessage(message: ArrayBuffer) {
    const decoder = new TextDecoder();

    let offest = 0;

    const id = decoder.decode(new Uint8Array(message, offest, 36));
    offest += 36;

    const buffer = message.slice(offest);

    return { transferId: id, buffer };
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

const DATA_CHANNEL_NAME = "data-channel";

const DB_NAME = "transfers_db";
const OBJECT_STORE_NAME = "transfers_chunks";
const DB_CHUNK_SIZE = 64 * 1024 * 1024; // 64MB
