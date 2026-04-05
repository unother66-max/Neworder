import { prisma } from "../../../lib/prisma";

export async function GET() {
  const places = await prisma.place.findMany();

  for (const place of places) {
    if (place.x && place.y) continue;

    try {
      const res = await fetch("http://localhost:3000/api/resolve-place-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: place.name,
          address: place.address,
        }),
      });

      const data = await res.json();

      if (data.x && data.y) {
        await prisma.place.update({
          where: { id: place.id },
          data: {
            x: data.x,
            y: data.y,
            imageUrl: data.image || place.imageUrl,
            placeUrl: data.mobilePlaceLink || place.placeUrl,
          },
        });

        console.log("업데이트 완료:", place.name);
      }
    } catch (e) {
      console.log("실패:", place.name);
    }
  }

  return Response.json({ ok: true });
}