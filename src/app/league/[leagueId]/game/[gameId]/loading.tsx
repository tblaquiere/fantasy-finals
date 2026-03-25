export default function Loading() {
  return (
    <main className="min-h-screen bg-zinc-950 pb-16 text-zinc-50">
      <div className="mx-auto max-w-xl px-4 py-4">
        <div className="mb-4 h-7 w-32 animate-pulse rounded bg-zinc-800" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-xl bg-zinc-900"
            />
          ))}
        </div>
      </div>
    </main>
  );
}
