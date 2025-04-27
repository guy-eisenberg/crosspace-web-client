"use client";

import FilesProvider from "@/context/FilesContext";
import SWProvider from "@/context/SWContext";
import { initLogRocket } from "@/utils/initLogRocket";
import dynamic from "next/dynamic";
import { useEffect } from "react";

const ConnectionsProvider = dynamic(
  () => import("@/context/ConnectionsContext"),
  { ssr: false },
);

export default function RootProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") initLogRocket();
  }, []);

  return (
    <SWProvider>
      <FilesProvider>
        <ConnectionsProvider>{children}</ConnectionsProvider>
      </FilesProvider>
    </SWProvider>
  );
}
