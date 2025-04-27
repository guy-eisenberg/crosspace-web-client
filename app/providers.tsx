"use client";

import ConnectionsProvider from "@/context/ConnectionsContext";
import FilesProvider from "@/context/FilesContext";
import SWProvider from "@/context/SWContext";
import { initLogRocket } from "@/utils/initLogRocket";
import { useEffect } from "react";

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
