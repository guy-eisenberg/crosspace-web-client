"use client";

import FileExplorer from "@/app/components/FileExplorer";
import FileUploader from "@/app/components/FileUploader";
import TransfersModal from "@/app/space/[id]/TransfersModal";
import { api } from "@/clients/api";
import { io } from "@/clients/io";
import { useConnections } from "@/context/ConnectionsContext";
import { useFiles } from "@/context/FilesContext";
import type {
  DeviceMetadata,
  FileMetadata,
  RTCTransferState,
  RTCTrasnfer,
} from "@/types";
import { parseUserAgent } from "@/utils/parseUserAgent";
import { ThumbnailGenerator } from "@/utils/ThumbnailGenerator";
import {
  Badge,
  Button,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@heroui/react";
import {
  IconArrowsTransferUpDown,
  IconDeviceIpad,
  IconDeviceLaptop,
  IconDeviceMobile,
  IconDevices,
  IconExternalLink,
  IconPlus,
  IconQrcode,
} from "@tabler/icons-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { DropzoneRef } from "react-dropzone";
import { v4 } from "uuid";
import ConnectModal from "./ConnectModal";
import ShareSpaceModal from "./ShareSpaceModal";

export default function SpacePageContent({ spaceId }: { spaceId: string }) {
  const searchParams = useSearchParams();

  const [init, setInit] = useState(false);

  const { addOwnedFile, getOwnedFile, deleteOwnedFile } = useFiles();
  const {
    deviceId,
    connectionStates,
    transferStates,
    connectTo,
    disconnectFrom,
    requestFileTransfer,
    startTransfer,
    deleteTransfer,
    pauseTransfer,
    getTransfer,
  } = useConnections();

  const dropzoneRef = useRef<DropzoneRef>(null);

  const [devices, setDevices] = useState<DeviceMetadata[]>([]);
  const [files, setFiles] = useState<{ [id: string]: FileMetadata }>({});

  const [shareSpaceModalOpen, setShareSpaceModalOpen] = useState(false);
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [transfersModalOpen, setTransfersModalOpen] = useState(false);

  const devicesWithState = useMemo(() => {
    return devices.map((device) => {
      const state = connectionStates[device.id];

      return {
        ...device,
        connected: state === "connected" || device.id === "this",
      };
    });
  }, [devices, connectionStates]);

  const { outTransfers, inTransfers } = useMemo(() => {
    const outTransfers: (RTCTrasnfer & { state: RTCTransferState })[] = [];
    const inTransfers: (RTCTrasnfer & { state: RTCTransferState })[] = [];

    for (const [transferId, state] of Object.entries(transferStates)) {
      const transfer = getTransfer(transferId);

      (transfer as any).state = state;

      if (transfer.type === "in")
        inTransfers.push(transfer as RTCTrasnfer & { state: RTCTransferState });
      else if (transfer.type === "out")
        outTransfers.push(
          transfer as RTCTrasnfer & { state: RTCTransferState },
        );
    }

    return { outTransfers, inTransfers };
  }, [getTransfer, transferStates]);

  useEffect(() => {
    init();

    async function init() {
      const token = searchParams.get("token");

      const res = await api(`/spaces/${spaceId}/join`, {
        method: "POST",
        body: JSON.stringify({
          token,
        }),
      });

      if (res.ok) {
        const { devices, files } = (await res.json()) as {
          devices: DeviceMetadata[];
          files: { [id: string]: FileMetadata };
        };

        setDevices(devices);
        setFiles(files);

        setInit(true);
      } else throw new Error("Failed to init space.");
    }
  }, [searchParams, spaceId]);

  useEffect(() => {
    if (!init) return;

    io().on("devices-changed", onDeviceChange);
    io().on("files-changed", onFilesChange);

    async function onDeviceChange(message: any) {
      const { device, event } = message as {
        device: DeviceMetadata;
        event: "connect" | "disconnect";
      };

      console.log("devices-changed", device.id, event);

      if (event === "connect") {
        await connectTo(device.id);

        setDevices((devices) => {
          if (!devices.map((d) => d.id).includes(device.id)) {
            return [...devices, device];
          }

          return devices;
        });
      } else if (event === "disconnect") {
        disconnectFrom(device.id);

        setDevices((devices) => [...devices]);
      }
    }

    async function onFilesChange(message: any) {
      const { files } = message as {
        files: { [id: string]: FileMetadata };
        event: "add" | "delete" | "thumbnails-update";
      };

      setFiles(files);
    }

    return () => {
      io().off("devices-changed", onDeviceChange);
      io().off("files-changed", onFilesChange);
    };
  }, [init, connectTo, disconnectFrom]);

  const transfersCount = outTransfers.length + inTransfers.length;
  const activeTransfersCount =
    outTransfers.filter((t) => t.state !== "done").length +
    inTransfers.filter((t) => t.state !== "done").length;

  useEffect(() => {
    if (transfersCount === 0) setTransfersModalOpen(false);
  }, [transfersCount]);

  if (!init) return null;

  return (
    <main className="relative flex h-full flex-col">
      <div className="bg-theme-bg relative min-h-0 flex-1">
        {activeTransfersCount > 0 && (
          <div className="bg-warning-100 border-warning border-b py-2 text-center font-medium">
            <p>Keep window open until all transfers are done</p>
          </div>
        )}
        <FileExplorer
          className="relative z-10 max-h-full overflow-y-auto"
          files={Object.values(files)}
          onDownload={requestFile}
          onDelete={deleteFile}
        />
        <div className="absolute inset-0">
          <FileUploader
            onUpload={onAddFiles}
            showPrompt={Object.values(files).length === 0}
            ref={dropzoneRef}
          />
        </div>

        <div className="absolute bottom-3 left-3 z-50 flex gap-2">
          <Button
            className="bg-theme-secondary rounded-full text-white"
            onPress={() => {
              if (dropzoneRef.current) dropzoneRef.current.open();
            }}
            isIconOnly
          >
            <IconPlus />
          </Button>
          {transfersCount > 0 && (
            <Badge
              classNames={{
                badge: "bg-theme-primary text-white",
              }}
              content={transfersCount}
            >
              <Button
                className="bg-theme-secondary rounded-full text-white"
                isIconOnly
                onPress={() => setTransfersModalOpen(true)}
              >
                <IconArrowsTransferUpDown />
              </Button>
            </Badge>
          )}
        </div>

        <Badge
          classNames={{
            base: "absolute bottom-3 z-50 right-3",
            badge: "bg-theme-primary text-white",
          }}
          content={devices.length}
          placement="top-left"
        >
          <Popover placement="top">
            <PopoverTrigger>
              <Button
                className="bg-theme-secondary rounded-full text-white"
                isIconOnly
              >
                <IconDevices />
              </Button>
            </PopoverTrigger>
            <PopoverContent>
              <div className="flex flex-col gap-2 px-1 py-2">
                {devicesWithState
                  .sort((a) => {
                    if (a.id === "this") return -1;
                    else return 0;
                  })
                  .map((device) => {
                    const agent = parseUserAgent(device.userAgent);

                    const [deviceType] = agent.split("-");

                    const deviceIcon = (() => {
                      switch (deviceType.split(":")[0]) {
                        case "Iphone":
                        case "Android":
                        case "Mobile":
                          return <IconDeviceMobile className="h-5 w-6" />;
                        case "Ipad":
                        case "Android-Tablet":
                          return <IconDeviceIpad />;
                        default:
                          return <IconDeviceLaptop className="h-6 w-6" />;
                      }
                    })();

                    return (
                      <div className="flex items-center" key={device.id}>
                        <div
                          className={cn(
                            "mr-3 h-2 w-2 rounded-full",
                            device.connected ? "bg-green-400" : "bg-gray-200",
                          )}
                        />
                        {deviceIcon}
                        <p className="ml-1">
                          {agent}
                          {device.id === "this" && (
                            <span className="text-gray-400"> This device</span>
                          )}
                        </p>
                      </div>
                    );
                  })}
              </div>
            </PopoverContent>
          </Popover>
        </Badge>
      </div>

      <div className="flex">
        <button
          className="bg-theme-primary/20 border-theme-primary hover:bg-theme-primary/40 flex flex-1 cursor-pointer flex-col items-center justify-center border-t p-2 sm:flex-row sm:gap-2"
          onClick={() => setShareSpaceModalOpen(true)}
        >
          <p className="font-semibold">Share Space</p>
          <IconQrcode className="h-6 w-6" />
        </button>
        <button
          className="bg-theme-secondary/20 border-theme-secondary hover:bg-theme-secondary/40 flex flex-1 cursor-pointer flex-col items-center justify-center border-t p-2 sm:flex-row sm:gap-2"
          onClick={() => setConnectModalOpen(true)}
        >
          <p className="font-semibold">Connect to another</p>
          <IconExternalLink className="h-6 w-6" />
        </button>
      </div>

      <TransfersModal
        outTransfers={outTransfers}
        inTransfers={inTransfers}
        startTransfer={startTransfer}
        deleteTransfer={deleteTransfer}
        pauseTransfer={pauseTransfer}
        isOpen={transfersModalOpen}
        onOpenChange={setTransfersModalOpen}
      />

      <ShareSpaceModal
        spaceId={spaceId}
        isOpen={shareSpaceModalOpen}
        onOpenChange={setShareSpaceModalOpen}
      />

      <ConnectModal
        isOpen={connectModalOpen}
        onOpenChange={setConnectModalOpen}
      />
    </main>
  );

  async function onAddFiles(files: File[]) {
    const newFilesData: { [id: string]: Omit<FileMetadata, "deviceId"> } = {};

    const fileWithThumbnails: (Omit<FileMetadata, "deviceId"> & {
      blob: File;
    })[] = [];

    for (const file of files) {
      const fileMetadata = {
        id: v4(),
        spaceId,
        name: file.name,
        type: file.type,
        size: file.size,
      };

      newFilesData[fileMetadata.id] = fileMetadata;

      if (ThumbnailGenerator.getFileType(file) !== "unsupported")
        fileWithThumbnails.push({ ...fileMetadata, blob: file });

      addOwnedFile(fileMetadata.id, file);
    }

    await api(`/spaces/${spaceId}/files`, {
      method: "POST",
      body: JSON.stringify({ files: Object.values(newFilesData) }),
    });

    await uploadThumbnails();

    async function uploadThumbnails() {
      const fileIds = fileWithThumbnails.map((f) => f.id);

      const res = await api(`/spaces/${spaceId}/thumbnail-upload-urls`, {
        method: "POST",
        body: JSON.stringify({
          fileIds,
        }),
      });

      if (!res.ok)
        throw new Error("Could not retrieve upload urls for thumbnails!");

      const { urls } = (await res.json()) as { urls: { [id: string]: string } };

      const thumbnailGenerator = new ThumbnailGenerator();

      await Promise.all(
        fileWithThumbnails.map((file) =>
          (async () => {
            const thumbnailBlob = await thumbnailGenerator.generate(file.blob);
            if (!thumbnailBlob) return;

            try {
              const uploadUrl = urls[file.id];

              const res = await fetch(uploadUrl, {
                method: "PUT",
                body: thumbnailBlob,
                headers: {
                  "Content-Type": "image/png",
                },
              });

              if (!res.ok)
                throw new Error(
                  `Could not upload thumbnail of file "${file.id}"`,
                );
            } catch {}
          })(),
        ),
      );

      await api(`/spaces/${spaceId}/update-file-thumbnails`, {
        method: "POST",
        body: JSON.stringify({ fileIds }),
      });
    }
  }

  async function deleteFile(file: FileMetadata) {
    const res = await api(`/spaces/${spaceId}/files`, {
      method: "DELETE",
      body: JSON.stringify({ fileIds: [file.id] }),
    });

    if (res.ok) deleteOwnedFile(file.id);
  }

  async function requestFile(file: FileMetadata) {
    if (file.deviceId === deviceId) {
      const ownedFile = getOwnedFile(file.id);

      if (ownedFile) {
        const a = document.createElement("a");
        a.download = file.name;

        const url = URL.createObjectURL(ownedFile);
        a.href = url;

        document.body.appendChild(a);
        a.click();
      }
    } else {
      const transfer = await requestFileTransfer({ file });

      await startTransfer(transfer.id);
    }
  }
}
