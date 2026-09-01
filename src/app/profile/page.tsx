import { ProfileView } from "@/components/marketplace/profile-view";
import { requireCurrentProfile } from "@/lib/session";
import { queryCircles } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function OwnProfilePage() {
  const user = await requireCurrentProfile();
  const circles = (await queryCircles(user.id))
    .filter((circle) => user.circleIds.includes(circle.id))
    .map((circle) => ({ id: circle.id, name: circle.name }));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <ProfileView user={user} isOwn circles={circles} />
    </div>
  );
}
