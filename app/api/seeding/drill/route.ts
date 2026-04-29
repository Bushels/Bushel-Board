import { NextRequest, NextResponse } from "next/server";
import { getStateDrillData } from "@/lib/queries/seeding-drill";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const stateCode = params.get("state");
  const commodity = params.get("crop");
  if (!stateCode || !commodity) {
    return NextResponse.json({ error: "Missing state or crop" }, { status: 400 });
  }
  const marketYear = new Date().getFullYear();
  const data = await getStateDrillData(stateCode, commodity, marketYear);
  return NextResponse.json(data);
}
