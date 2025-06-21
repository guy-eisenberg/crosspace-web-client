"use client";

import ConnectionsProvider from "@/context/ConnectionsContext";
import FilesProvider from "@/context/FilesContext";
import SWProvider from "@/context/SWContext";
import { initLogRocket } from "@/utils/initLogRocket";
import { HeroUIProvider, ToastProvider } from "@heroui/react";
import { ThemeProvider } from "next-themes";
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
        <ConnectionsProvider>
          <HeroUIProvider className="h-full w-full">
            <ToastProvider placement="top-center" />
            <ThemeProvider attribute="class">{children}</ThemeProvider>
          </HeroUIProvider>
        </ConnectionsProvider>
      </FilesProvider>
    </SWProvider>
  );
}
