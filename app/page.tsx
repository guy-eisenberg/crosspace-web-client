import { redirect } from "next/navigation";
import { v4 } from "uuid";

export default async function HomePage() {
  const spaceId = v4();

  redirect(`/space/${spaceId}`);
}
