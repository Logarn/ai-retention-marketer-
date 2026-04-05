import { NextResponse } from "next/server";
import { THINKING_MESSAGES } from "@/lib/agent/worklin";

export const maxDuration = 10;

export async function GET() {
  return NextResponse.json({ messages: [...THINKING_MESSAGES] });
}
