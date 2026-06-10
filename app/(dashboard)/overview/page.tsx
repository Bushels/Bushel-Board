import { redirect } from "next/navigation";

// /overview is hidden as of 2026-06-10 (Kyle: "I do not find a utility in it right
// now") - the Bull/Bear Thesis Board is the flagship surface. The page's components
// under components/overview/ are retained per the retire-don't-recreate pattern;
// restore by reverting this file in git history.
export default function OverviewRedirect() {
  redirect("/thesis");
}
