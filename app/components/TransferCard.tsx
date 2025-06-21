import { RTCTransferState, RTCTrasnfer } from "@/types";
import { fileSizeLabel } from "@/utils/fileSizeLabel";
import { Progress } from "@heroui/react";
import {
  IconPlayerPause,
  IconPlayerPlay,
  IconTrash,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import FileTypeIcon from "./FileTypeIcon";

export default function TransferCard({
  transfer,
  transferStart,
  transferPause,
  transferDelete,
}: {
  transfer: RTCTrasnfer & { state: RTCTransferState };
  transferStart: () => void;
  transferPause: () => void;
  transferDelete: () => void;
}) {
  const [progress, setProgress] = useState(0);
  const [rate, setRate] = useState(0);

  useEffect(() => {
    const UPDATE_RATE = 4; // 4 times a second

    let lastRateIntervalBytes = transfer.transferedBytes;
    const updateInterval = setInterval(() => {
      setProgress(
        Math.floor((transfer.transferedBytes / transfer.file.size) * 100),
      );

      const rate =
        (transfer.transferedBytes - lastRateIntervalBytes) * UPDATE_RATE;
      lastRateIntervalBytes = transfer.transferedBytes;

      setRate(rate);
    }, 1000 / UPDATE_RATE);

    return () => {
      clearInterval(updateInterval);
    };
  }, [transfer]);

  return (
    <div className="flex gap-2" key={transfer.id}>
      {transfer.file.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt="thumbnail"
          className="h-12 w-12 shrink-0"
          src={transfer.file.thumbnail}
        />
      ) : (
        <FileTypeIcon
          className="shrink-0"
          type={transfer.file.type}
          width={48}
          height={48}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-auto flex flex-1 items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <p className="w-full overflow-hidden text-left text-sm font-medium overflow-ellipsis whitespace-nowrap">
                {transfer.file.name}
              </p>
              {transfer.state === "ongoing" && (
                <span className="text-xs font-black whitespace-nowrap">
                  {fileSizeLabel(rate)}/s
                </span>
              )}
            </div>
            <p className="text-default-400 text-xs">
              {fileSizeLabel(transfer.file.size)}
            </p>
          </div>
          <div className="mt-1 flex items-center gap-2">
            {transfer.state !== "done" &&
              (transfer.state === "ongoing" ? (
                <button
                  className="h-6 w-6 cursor-pointer p-1"
                  onClick={transferPause}
                >
                  <IconPlayerPause className="h-full w-full" />
                </button>
              ) : (
                <button
                  className="h-6 w-6 cursor-pointer p-1"
                  onClick={transferStart}
                >
                  <IconPlayerPlay className="h-full w-full" />
                </button>
              ))}
            <button
              className="h-6 w-6 cursor-pointer p-1"
              onClick={transferDelete}
            >
              <IconTrash className="text-danger h-full w-full" />
            </button>
          </div>
        </div>
        <Progress
          value={progress}
          size="sm"
          color={transfer.state === "done" ? "success" : "primary"}
        />
      </div>
    </div>
  );
}
