"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { AREA_FSA_COOKIE, normalizeFsaInput } from "@/lib/utils/area";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Store the farmer's postal area (FSA) so the board can localize. Cookie-only; no account needed. */
export async function setAreaFsa(formData: FormData): Promise<void> {
  const fsa = normalizeFsaInput(String(formData.get("postal") ?? ""));
  const store = await cookies();

  if (fsa) {
    store.set(AREA_FSA_COOKIE, fsa, {
      path: "/",
      maxAge: ONE_YEAR_SECONDS,
      sameSite: "lax",
    });
  }

  revalidatePath("/thesis");
}

export async function clearAreaFsa(): Promise<void> {
  const store = await cookies();
  store.delete(AREA_FSA_COOKIE);
  revalidatePath("/thesis");
}
