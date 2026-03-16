import { redirect } from "next/navigation";
import { getAuthenticatedUserContext } from "@/lib/auth/role-guard";
import { AdvisorChat } from "@/components/advisor/advisor-chat";
import { SectionHeader } from "@/components/dashboard/section-header";
import { Info } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdvisorPage() {
  const { user, role } = await getAuthenticatedUserContext();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Kitchen Table Advisor"
        subtitle="Ask anything about your grain — delivery timing, basis, contracts, or how you compare to the platform"
      />

      {role === "observer" ? (
        <div className="rounded-xl border border-wheat-200 bg-wheat-50 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            The advisor chat is available for farmers. Sign up and add your crop
            plan to get personalized market advice.
          </p>
        </div>
      ) : (
        <>
          <AdvisorChat />
          <div className="flex items-start gap-2 rounded-lg border border-wheat-200 dark:border-wheat-700 bg-wheat-50/50 dark:bg-wheat-900/50 px-4 py-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              This advisor provides AI-generated market analysis based on CGC
              data, futures prices, and grain marketing frameworks. It is not
              financial advice. All grain marketing decisions are yours to make.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
