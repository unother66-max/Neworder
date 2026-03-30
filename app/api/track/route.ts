import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { keyword, placeUrl } = await req.json();

  if (!keyword || !placeUrl) {
    return NextResponse.json({ error: "값 없음" }, { status: 400 });
  }

  const track = await prisma.track.create({
    data: {
      keyword,
      placeUrl,
    },
  });

  return NextResponse.json(track);
}