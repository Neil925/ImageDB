import { NextResponse } from "next/server";
import { db, dbReady } from "@/db";

export async function GET() {
  try {
    await dbReady();
    await db.execute("select 1");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
