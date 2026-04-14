import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BushyChat } from "@/components/bushy/bushy-chat";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ prompt?: string }>;
}

export default async function ChatPage({ searchParams }: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { prompt } = await searchParams;

  return (
    /* Cancel layout padding so chat fills viewport edge-to-edge on mobile */
    <div className="-mx-4 -mb-6 -mt-4">
      <BushyChat initialPrompt={prompt} />
    </div>
  );
}
