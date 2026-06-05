export default function Loading() {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-zinc-100/90 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-neutral-200 border-t-[#2b7fff]" />

        <div className="text-2xl font-black italic tracking-tight text-neutral-800">
          Pick Fights
        </div>

        <p className="text-sm font-semibold text-neutral-500">Loading...</p>
      </div>
    </div>
  );
}
