"use client";

import { useMounted } from "@/hooks/useMounted";
import QRCode from "react-qr-code";

export default function ConnectQRCode({
  spaceId,
  totp,
  ...rest
}: { spaceId: string; totp: string } & React.HTMLAttributes<HTMLOrSVGElement>) {
  const mounted = useMounted();
  if (!mounted) return null;

  return (
    <>
      <QRCode
        {...rest}
        className="h-48 w-48 dark:hidden"
        bgColor="transparent"
        value={`${process.env.NEXT_PUBLIC_SITE_URL}/space/${spaceId}?totp=${totp}`}
      />
      <QRCode
        {...rest}
        className="hidden h-48 w-48 dark:block"
        fgColor="white"
        bgColor="transparent"
        value={`${process.env.NEXT_PUBLIC_SITE_URL}/space/${spaceId}?totp=${totp}`}
      />
    </>
  );
}
