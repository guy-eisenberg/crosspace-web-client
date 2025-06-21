"use client";

import { FileMetadata } from "@/types";
import { fileSizeLabel } from "@/utils/fileSizeLabel";
import { cn } from "@heroui/react";
import FileTypeIcon from "./FileTypeIcon";

export default function ExplorerCell({
  file,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & {
  file: FileMetadata;
}) {
  return (
    <div
      className={cn(
        "flex cursor-pointer flex-col items-center px-3 py-6",
        rest.className,
      )}
    >
      {file.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="thumbnail" src={file.thumbnail} height={64} width={64} />
      ) : (
        <FileTypeIcon type={file.type} width={64} height={64} />
      )}
      <p className="mt-3 w-full overflow-hidden text-center text-sm font-medium overflow-ellipsis whitespace-nowrap">
        {file.name}
      </p>
      <p className="text-default-400 text-xs">{fileSizeLabel(file.size)}</p>
    </div>
  );
}
