import { NextRequest } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";

const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

const WEB_MERCATOR_WORLD = 20037508.342789244;
const AAFC_WEEKLY_ANOMALY_EXPORT =
  "https://agriculture.canada.ca/imagery-images/rest/services/" +
  "percent_saturated_surface_soil_moisture/weekly_anomaly/ImageServer/exportImage";

function tileToMercatorX(x: number, z: number): number {
  return (x / 2 ** z) * WEB_MERCATOR_WORLD * 2 - WEB_MERCATOR_WORLD;
}

function tileToMercatorY(y: number, z: number): number {
  return WEB_MERCATOR_WORLD - (y / 2 ** z) * WEB_MERCATOR_WORLD * 2;
}

function parseTileValue(value: string): number | null {
  const parsed = Number.parseInt(value.replace(".png", ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function transparentTile() {
  return new Response(TRANSPARENT_PNG, {
    headers: {
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "Content-Type": "image/png",
    },
  });
}

async function removeBlackNoDataPixels(imageBuffer: ArrayBuffer): Promise<Buffer> {
  const image = sharp(Buffer.from(imageBuffer)).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const pixels = Buffer.from(data);

  for (let i = 0; i < pixels.length; i += 4) {
    const red = pixels[i] ?? 0;
    const green = pixels[i + 1] ?? 0;
    const blue = pixels[i + 2] ?? 0;
    if (red < 8 && green < 8 && blue < 8) {
      pixels[i + 3] = 0;
    }
  }

  return sharp(pixels, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png()
    .toBuffer();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<unknown> },
) {
  const routeParams = (await params) as { z?: unknown; x?: unknown; y?: unknown };
  const zValue = typeof routeParams.z === "string" ? routeParams.z : "";
  const xValue = typeof routeParams.x === "string" ? routeParams.x : "";
  const yValue = typeof routeParams.y === "string" ? routeParams.y : "";
  const z = parseTileValue(zValue);
  const x = parseTileValue(xValue);
  const y = parseTileValue(yValue);

  if (z === null || x === null || y === null || z < 0 || z > 12) {
    return transparentTile();
  }

  const time = request.nextUrl.searchParams.get("time") ?? "";
  const validTime = /^\d{10,14}$/.test(time) ? time : "";
  const minX = tileToMercatorX(x, z);
  const maxX = tileToMercatorX(x + 1, z);
  const maxY = tileToMercatorY(y, z);
  const minY = tileToMercatorY(y + 1, z);

  const paramsForArcGis = new URLSearchParams({
    bbox: [minX, minY, maxX, maxY].join(","),
    bboxSR: "102100",
    imageSR: "102100",
    size: "256,256",
    format: "png",
    transparent: "true",
    f: "image",
  });
  if (validTime) paramsForArcGis.set("time", validTime);

  try {
    const upstream = await fetch(`${AAFC_WEEKLY_ANOMALY_EXPORT}?${paramsForArcGis}`, {
      next: { revalidate: 86400 },
    });
    if (!upstream.ok) return transparentTile();

    const contentType = upstream.headers.get("content-type") ?? "";
    if (!contentType.includes("image/")) return transparentTile();

    const cleanedTile = await removeBlackNoDataPixels(await upstream.arrayBuffer());

    return new Response(new Uint8Array(cleanedTile), {
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "Content-Type": "image/png",
      },
    });
  } catch {
    return transparentTile();
  }
}
