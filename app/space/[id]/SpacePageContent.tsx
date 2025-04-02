"use client";

import ConnectQRCode from "@/app/components/ConnectQRCode";
import { io } from "@/clients/io";
import { useConnections } from "@/context/ConnectionsContext";
import type { FileMetadata } from "@/types";
import { fileSizeLabel } from "@/utils/fileSizeLabel";
import { IconQrcode } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { v4 } from "uuid";

export default function SpacePageContent({ spaceId }: { spaceId: string }) {
  const { state, progress, connectTo } = useConnections();

  const inputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<FileMetadata[]>([]);

  useEffect(() => {
    init();

    async function init() {
      const response = await io().emitWithAck("join-space", { spaceId });
      setFiles(response.files);
    }
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

      console.log(files);

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
        <progress
          className="progress progress-primary w-56"
          value={progress}
          max="100"
        ></progress>
      )}
    </main>
  );

  async function onAddFiles(files: FileList) {
    const newFilesData: FileMetadata[] = [];

    for (const file of files) {
      newFilesData.push({
        id: v4(),
        name: file.name,
        type: file.type,
        size: file.size,
        url: URL.createObjectURL(file),
      });
    }

    if (inputRef.current) inputRef.current.value = "";

    await io().emitWithAck("new-files", {
      space: spaceId,
      files: newFilesData,
    });
  }

  async function onFileDelete(file: FileMetadata) {
    await io().emitWithAck("file-deleted", { space: spaceId, id: file.id });
  }

  function requestFile(file: FileMetadata) {
    io().emit("file-request", { space: spaceId, id: file.id });
  }
}
