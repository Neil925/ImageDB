import { NextResponse, type NextRequest } from "next/server";
import { autocompleteTags } from "@/lib/tags";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  return NextResponse.json(autocompleteTags(q, 12));
}
