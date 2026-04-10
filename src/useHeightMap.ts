import { useEffect, useState } from "react";

export const TERRAIN_SIZE = 100;

export interface HeightMapData {
  pixels: Float32Array;
  width: number;
  height: number;
}

export function sampleHeight(
  data: Float32Array,
  imgW: number,
  imgH: number,
  u: number,
  v: number,
): number {
  const px = Math.max(0, Math.min(u * (imgW - 1), imgW - 1));
  const py = Math.max(0, Math.min(v * (imgH - 1), imgH - 1));
  const px0 = Math.floor(px);
  const py0 = Math.floor(py);
  const px1 = Math.min(px0 + 1, imgW - 1);
  const py1 = Math.min(py0 + 1, imgH - 1);
  const fx = px - px0;
  const fy = py - py0;

  return (
    data[py0 * imgW + px0] * (1 - fx) * (1 - fy) +
    data[py0 * imgW + px1] * fx * (1 - fy) +
    data[py1 * imgW + px0] * (1 - fx) * fy +
    data[py1 * imgW + px1] * fx * fy
  );
}

/** Convert world (x, z) to terrain height (y). */
export function getTerrainY(
  heightMap: HeightMapData,
  heightScale: number,
  worldX: number,
  worldZ: number,
): number {
  const u = worldX / TERRAIN_SIZE + 0.5;
  const v = worldZ / TERRAIN_SIZE + 0.5;
  return (
    sampleHeight(heightMap.pixels, heightMap.width, heightMap.height, u, v) *
    heightScale
  );
}

export function useHeightMap(src: string): HeightMapData | null {
  const [heightMap, setHeightMap] = useState<HeightMapData | null>(null);

  useEffect(() => {
    const img = new Image();
    img.src = src;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      const pixels = new Float32Array(img.width * img.height);
      for (let i = 0; i < pixels.length; i++) {
        pixels[i] = imageData.data[i * 4] / 255;
      }
      setHeightMap({ pixels, width: img.width, height: img.height });
    };
  }, [src]);

  return heightMap;
}
