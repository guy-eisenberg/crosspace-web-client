"use client";

import { type Ref } from "react";
import Dropzone, { type DropzoneRef } from "react-dropzone";
import NoFilesIcon from "./icons/NoFilesIcon";

export default function FileUploader({
  showPrompt,
  onUpload,
  ref,
}: {
  showPrompt: boolean;
  onUpload: (files: File[]) => void;
  ref: Ref<DropzoneRef>;
}) {
  return (
    <Dropzone onDrop={onUpload} ref={ref}>
      {({ getRootProps, getInputProps }) => (
        <div
          className="flex h-full w-full cursor-pointer items-center justify-center p-4 text-center"
          {...getRootProps()}
        >
          <input {...getInputProps()} />
          {showPrompt && (
            <div className="flex flex-col items-center justify-center gap-2">
              <NoFilesIcon className="w-36" />
              <p className="text-gray-500">
                Drag & drop some files here, or click to select files
              </p>
            </div>
          )}
        </div>
      )}
    </Dropzone>
  );
}
