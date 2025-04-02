"use client";

import { useMounted } from "@/hooks/useMounted";
import QRCode from "react-qr-code";

export default function ConnectQRCode({
  spaceId,
  ...rest
}: { spaceId: string } & React.HTMLAttributes<HTMLOrSVGElement>) {
  const mounted = useMounted();
  if (!mounted) return null;

  return (
    <QRCode
      {...rest}
      value={`${process.env.NEXT_PUBLIC_SITE_URL}/space/${spaceId}`}
    />
  );
}
