import { FileMetadata } from "@/types";
import dynamic from "next/dynamic";
import { ComponentType, SVGAttributes } from "react";
import BlankIcon from "./icons/file-icons/BlankIcon";

const JPGIcon = dynamic(() => import("./icons/file-icons/JPGIcon"), {
  loading: () => <BlankIcon height={64} width={64} />,
});
const PDFIcon = dynamic(() => import("./icons/file-icons/PdfIcon"), {
  loading: () => <BlankIcon height={64} width={64} />,
});
const TXTIcon = dynamic(() => import("./icons/file-icons/TXTIcon"), {
  loading: () => <BlankIcon height={64} width={64} />,
});
const PNGIcon = dynamic(() => import("./icons/file-icons/PNGIcon"), {
  loading: () => <BlankIcon height={64} width={64} />,
});
const ZIPIcon = dynamic(() => import("./icons/file-icons/ZIPIcon"), {
  loading: () => <BlankIcon height={64} width={64} />,
});
const SVGIcon = dynamic(() => import("./icons/file-icons/SVGIcon"), {
  loading: () => <BlankIcon height={64} width={64} />,
});
const MP4Icon = dynamic(() => import("./icons/file-icons/MP4Icon"), {
  loading: () => <BlankIcon height={64} width={64} />,
});

export default function FileTypeIcon({
  type,
  ...rest
}: React.SVGAttributes<SVGElement> & { type: FileMetadata["type"] }) {
  const FileIconComponent = TypeToIcon[type] || BlankIcon;

  return <FileIconComponent {...rest} />;
}

const TypeToIcon: {
  [type in FileMetadata["type"]]:
    | ComponentType<SVGAttributes<SVGElement>>
    | undefined;
} = {
  "application/pdf": PDFIcon,
  "text/plain": TXTIcon,
  "image/png": PNGIcon,
  "image/jpeg": JPGIcon,
  "application/zip": ZIPIcon,
  "image/svg+xml": SVGIcon,
  "video/mp4": MP4Icon,
  "audio/mpeg": undefined,
  "application/json": undefined,
  "text/html": undefined,
  "text/css": undefined,
  "text/javascript": undefined,
  empty: undefined,
};
