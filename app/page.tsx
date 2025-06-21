import { redirect } from "next/navigation";
import { v4 } from "uuid";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const spaceId = v4();

  redirect(`/space/${spaceId}`);
}
