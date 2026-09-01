import { notFound } from "next/navigation";
import { ProfileView } from "@/components/marketplace/profile-view";
import { getProfileById } from "@/lib/session";
import { queryCircles } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getProfileById(id);
  if (!user) notFound();
  const circles = (await queryCircles())
    .filter((circle) => user.circleIds.includes(circle.id))
    .map((circle) => ({ id: circle.id, name: circle.name }));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <ProfileView user={user} circles={circles} />
    </div>
  );
}
