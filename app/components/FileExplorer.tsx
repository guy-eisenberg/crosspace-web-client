"use client";

import { FileMetadata } from "@/types";
import {
  cn,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
} from "@heroui/react";
import { IconDownload, IconTrash } from "@tabler/icons-react";
import ExplorerCell from "./ExplorerCell";

export default function FileExplorer({
  files,
  onDownload,
  onDelete,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & {
  files: FileMetadata[];
  onDownload: (file: FileMetadata) => void;
  onDelete: (file: FileMetadata) => void;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2 p-4 md:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]",
        rest.className,
      )}
    >
      {files.map((file) => (
        <Dropdown
          classNames={{
            trigger:
              "aria-[expanded=true]:bg-foreground-100 aria-[expanded=true]:scale-100 aria-[expanded=true]:opacity-100",
          }}
          key={file.id}
        >
          <DropdownTrigger>
            <button className="hover:bg-foreground-100 rounded-xl">
              <ExplorerCell file={file} />
            </button>
          </DropdownTrigger>
          <DropdownMenu
            onAction={(key) => {
              switch (key) {
                case "download":
                  onDownload(file);
                  break;
                case "delete":
                  onDelete(file);
                  break;
              }
            }}
          >
            <DropdownItem key="download" startContent={<IconDownload />}>
              Download
            </DropdownItem>
            <DropdownItem
              key="delete"
              className="text-danger"
              color="danger"
              startContent={<IconTrash />}
            >
              Delete
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
      ))}
    </div>
  );
}
