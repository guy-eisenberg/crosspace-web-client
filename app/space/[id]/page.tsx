import SpacePageContent from "./SpacePageContent";

export default async function SpacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <SpacePageContent spaceId={id} />;
}
