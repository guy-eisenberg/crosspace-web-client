"use client";

import FilesProvider from "@/context/FilesContext";
import SWProvider from "@/context/SWContext";
import dynamic from "next/dynamic";

const ConnectionsProvider = dynamic(
  () => import("@/context/ConnectionsContext"),
  { ssr: false },
);

export default function RootProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SWProvider>
      <FilesProvider>
        <ConnectionsProvider>{children}</ConnectionsProvider>
      </FilesProvider>
    </SWProvider>
  );
}
