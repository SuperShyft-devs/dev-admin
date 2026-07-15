import { ExpertPortalLayout } from "../../layouts/ExpertPortalLayout";

export function ExpertPortalPage() {
  return (
    <ExpertPortalLayout>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl font-semibold text-zinc-900 mb-2">Dashboard</h1>
        <p className="text-sm text-zinc-500">Welcome to the Expert Portal.</p>
      </div>
    </ExpertPortalLayout>
  );
}
