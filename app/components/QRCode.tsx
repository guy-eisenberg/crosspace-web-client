"use client";

import { useMounted } from "@/hooks/useMounted";
import { default as _QRCode } from "react-qr-code";

export default function QRCode({
  value,
  ...rest
}: {
  value: string;
} & React.HTMLAttributes<HTMLOrSVGElement>) {
  const mounted = useMounted();
  if (!mounted) return null;

  return (
    <>
      <_QRCode
        {...rest}
        className="h-48 w-48 dark:hidden"
        bgColor="transparent"
        value={value}
      />
      <_QRCode
        {...rest}
        className="hidden h-48 w-48 dark:block"
        fgColor="white"
        bgColor="transparent"
        value={value}
      />
    </>
  );
}
