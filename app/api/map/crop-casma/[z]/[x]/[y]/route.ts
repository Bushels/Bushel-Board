import { NextRequest } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";

const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

const LAYER_PATTERN =
  /^SMAP-HYB-1KM-ANOMALY-WEEKLY_(\d{4})_\d{2}_\d{4}\.\d{2}\.\d{2}_\d{4}\.\d{2}\.\d{2}$/;

function tileToLon(x: number, z: number): number {
  return (x / 2 ** z) * 360 - 180;
}

function tileToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
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
  const layer = request.nextUrl.searchParams.get("layer") ?? "";
  const match = LAYER_PATTERN.exec(layer);
  const layerYear = match?.[1];

  if (z === null || x === null || y === null || z < 0 || z > 12 || !layerYear) {
    return transparentTile();
  }

  const minLon = tileToLon(x, z);
  const maxLon = tileToLon(x + 1, z);
  const maxLat = tileToLat(y, z);
  const minLat = tileToLat(y + 1, z);

  const paramsForWms = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.1.1",
    REQUEST: "GetMap",
    MAP: `/WMS/SMAP-HYB-1KM-ANOMALY-WEEKLY_${layerYear}.map`,
    LAYERS: layer,
    SRS: "EPSG:4326",
    FORMAT: "image/png",
    TRANSPARENT: "true",
    BBOX: [minLon, minLat, maxLon, maxLat].join(","),
    WIDTH: "256",
    HEIGHT: "256",
  });
  const url = `https://cloud.csiss.gmu.edu/smap_server/cgi-bin/mapserv?${paramsForWms}`;

  try {
    const upstream = await fetch(url, { next: { revalidate: 86400 } });
    if (!upstream.ok) return transparentTile();

    const contentType = upstream.headers.get("content-type") ?? "";
    if (!contentType.includes("image/png")) return transparentTile();

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
