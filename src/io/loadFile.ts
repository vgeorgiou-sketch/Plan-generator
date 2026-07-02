import type { BackgroundImage } from "../types/model";
import { pdfjsLib } from "./pdf";
import { extractFirstPageVectors, type PxPoint } from "./pdfVectorExtract";

const PDF_RENDER_SCALE = 2;

export interface LoadedBackground {
  background: BackgroundImage;
  vectorPolygons: PxPoint[][];
}

function loadImageFile(file: File): Promise<LoadedBackground> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({
        background: { url, widthPx: img.naturalWidth, heightPx: img.naturalHeight },
        vectorPolygons: [],
      });
    };
    img.onerror = reject;
    img.src = url;
  });
}

async function loadPdfFile(file: File): Promise<LoadedBackground> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  await page.render({ canvasContext: ctx, viewport }).promise;

  let vectorPolygons: PxPoint[][] = [];
  try {
    vectorPolygons = await extractFirstPageVectors(pdf, viewport);
  } catch {
    // Scanned/raster PDFs correctly yield no vector data; fall back to
    // manual trace over the rendered raster background.
    vectorPolygons = [];
  }

  return {
    background: {
      url: canvas.toDataURL("image/png"),
      widthPx: viewport.width,
      heightPx: viewport.height,
    },
    vectorPolygons,
  };
}

export async function loadFileAsBackground(file: File): Promise<LoadedBackground> {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return loadPdfFile(file);
  }
  return loadImageFile(file);
}
