"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function JoinInput() {
  const router = useRouter();

  const [spaceId, setSpaceId] = useState<string>("");

  return (
    <div className="join">
      <input
        className="input input-primary join-item"
        type="text"
        placeholder="Space id"
        value={spaceId}
        onChange={(e) => setSpaceId(e.target.value)}
      />
      <button
        className="btn btn-primary join-item"
        disabled={spaceId.length === 0}
        onClick={joinSpace}
      >
        Join
      </button>
    </div>
  );

  async function joinSpace() {
    router.push(`/space/${spaceId}`);
  }
}
