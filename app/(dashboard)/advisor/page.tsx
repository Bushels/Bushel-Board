import { redirect } from "next/navigation";
import { getAuthenticatedUserContext } from "@/lib/auth/role-guard";
import { AdvisorChat } from "@/components/advisor/advisor-chat";
import { SectionHeader } from "@/components/dashboard/section-header";

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
        subtitle="Ask anything about your grain — delivery timing, basis, contracts, or how you compare to other farmers"
      />

      {role === "observer" ? (
        <div className="rounded-xl border border-wheat-200 bg-wheat-50 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            The advisor chat is available for farmers. Sign up and add your crop
            plan to get personalized market advice.
          </p>
        </div>
      ) : (
        <AdvisorChat />
      )}
    </div>
  );
}
