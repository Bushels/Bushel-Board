import { redirect } from "next/navigation";

// /overview is hidden as of 2026-06-10 (Kyle: "I do not find a utility in it right
// now") - the Bull/Bear Thesis Board is the flagship surface. The old all-grain
// components under components/overview/ were DELETED 2026-07-11 (Kyle: wheat-only,
// dead code gone); recover from git history before commit ce86d7c if ever needed.
// This redirect stays so old links and bookmarks keep working.
export default function OverviewRedirect() {
  redirect("/thesis");
}
