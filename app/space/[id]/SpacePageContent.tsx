"use client";

import ConnectQRCode from "@/app/components/ConnectQRCode";
import ProgressScreen from "@/app/components/ProgressScreen";
import { io } from "@/clients/io";
import { useConnections } from "@/context/ConnectionsContext";
import { useFiles } from "@/context/FilesContext";
import type { FileMetadata } from "@/types";
import { fileSizeLabel } from "@/utils/fileSizeLabel";
import { cn } from "@heroui/theme";
import { IconQrcode } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { v4 } from "uuid";

export default function SpacePageContent({ spaceId }: { spaceId: string }) {
  const { addOwnedFile, deleteOwnedFile } = useFiles();
  const { state, progress, rate, connectTo } = useConnections();

  const inputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<FileMetadata[]>([]);

  useEffect(() => {
    init();

    io().on("connect", () => {
      console.log("space connect");
      init();
    });

    async function init() {
      const response = await io().emitWithAck("join-space", { spaceId });
      setFiles(response.files);
    }

    return () => {
      io().off("reconnect");
    };
  }, [spaceId]);

  useEffect(() => {
    io().on("new-device", async (message) => {
      const { space, device } = message as {
        space: string;
        device: string;
      };

      if (space === spaceId) await connectTo(device);
    });

    return () => {
      io().off("new-device");
    };
  }, [spaceId, connectTo]);

  useEffect(() => {
    io().on("files-changed", (message) => {
      const { space, files } = message as {
        space: string;
        files: FileMetadata[];
      };

      if (space === spaceId) setFiles(files);
    });

    return () => {
      io().off("files-changed");
    };
  }, [spaceId]);

  useEffect(() => {
    io().on("device-disconnected", () => {});

    return () => {
      io().off("device-disconnected");
    };
  }, [spaceId]);

  return (
    <main className="relative flex h-full flex-col gap-8 p-4">
      <div className="flex flex-col items-center gap-2">
        <div className="flex gap-2">
          <input
            type="file"
            className="file-input file-input-primary"
            onChange={(e) => {
              if (e.target.files) onAddFiles(e.target.files);
            }}
            ref={inputRef}
          />
          <div className="dropdown dropdown-end md:dropdown-center">
            <div tabIndex={0} role="button" className="btn">
              <IconQrcode />
            </div>
            <div
              tabIndex={0}
              className="dropdown-content card card-sm bg-base-100 z-1 w-64 shadow-md"
            >
              <div className="card-body">
                <ConnectQRCode className="w-full" spaceId={spaceId} />
              </div>
            </div>
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 md:grid-cols-5">
          {files.map((file) => (
            <div className="card bg-base-300 card-border" key={file.id}>
              <div className="card-body">
                <p className="card-title truncate text-sm text-ellipsis">
                  {file.name}
                </p>
                <p className="text-[#888]">{fileSizeLabel(file.size)}</p>
                <div className="card-actions">
                  <button
                    className="btn btn-primary"
                    onClick={() => requestFile(file)}
                  >
                    Download
                  </button>
                  <button
                    className="btn btn-warning"
                    onClick={() => onFileDelete(file)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {state === "transfer" && (
        <ProgressScreen
          className={cn(
            state === "transfer" ? "opacity-100" : "-z-10 opacity-0",
          )}
          progress={progress}
          rate={rate}
        />
      )}
    </main>
  );

  async function onAddFiles(files: FileList) {
    const newFilesData: FileMetadata[] = [];

    for (const file of files) {
      const id = v4();

      newFilesData.push({
        id,
        name: file.name,
        type: file.type,
        size: file.size,
        url: URL.createObjectURL(file),
      });

      addOwnedFile(id, file);
    }

    if (inputRef.current) inputRef.current.value = "";

    await io().emitWithAck("new-files", {
      space: spaceId,
      files: newFilesData,
    });
  }

  async function onFileDelete(file: FileMetadata) {
    await io().emitWithAck("file-deleted", { space: spaceId, id: file.id });

    deleteOwnedFile(file.id);
  }

  function requestFile(file: FileMetadata) {
    io().emit("file-request", { space: spaceId, id: file.id });
  }
}
