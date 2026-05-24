import { NextResponse } from "next/server";

export async function GET() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION || "unknown";
  return NextResponse.json({
    version,
    name: "DietLedger",
    node: process.version,
    env: process.env.NODE_ENV,
    docker: !!process.env.DOCKER,
  });
}