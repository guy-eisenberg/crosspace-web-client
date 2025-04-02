"use client";

import { api } from "@/clients/api";
import { io } from "@/clients/io";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ConnectQRCode from "./components/ConnectQRCode";
import Icon from "./components/Icon";
import JoinInput from "./components/JoinInput";

export default function HomePage() {
  const router = useRouter();
  const [spaceId, setSpaceId] = useState<string | null>(null);

  useEffect(() => {
    getSpaceId().then((spaceId) => {
      io().on("new-device", (message) => {
        const { space } = message as {
          space: string;
        };

        if (space === spaceId) router.push(`/space/${space}`);
      });

      setSpaceId(spaceId);
    });

    async function getSpaceId() {
      const res = await api("/portal", { method: "POST" });
      const { spaceId } = (await res.json()) as { spaceId: string };

      return spaceId;
    }

    return () => {};
  }, [router]);

  return (
    <main className="flex h-full flex-col items-center justify-center gap-4">
      <div className="flex flex-col items-center gap-2">
        <Icon className="h-12 w-12" />
        <h1 className="text-2xl font-semibold">Start sharing</h1>
      </div>
      {spaceId && <ConnectQRCode spaceId={spaceId} />}
      <JoinInput />
    </main>
  );
}
