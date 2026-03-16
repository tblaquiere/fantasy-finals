import { redirect } from "next/navigation";

import { auth } from "~/server/auth";
import { BottomNav } from "~/components/shared/BottomNav";
import { CreateLeagueForm } from "~/components/league/CreateLeagueForm";

export default async function NewLeaguePage() {
  const session = await auth();
  if (!session) redirect("/sign-in");

  return (
    <main className="min-h-screen bg-zinc-950 pb-16 text-zinc-50">
      <div className="mx-auto max-w-xl px-4 py-6">
        <h1 className="mb-6 text-2xl font-bold text-orange-500">Create a League</h1>
        <CreateLeagueForm />
      </div>
      <BottomNav />
    </main>
  );
}
