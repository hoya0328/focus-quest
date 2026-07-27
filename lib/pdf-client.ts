"use client";

import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  MAX_ANALYSIS_CHARACTERS,
  MAX_PDF_BYTES,
  MAX_PDF_PAGES,
  type PdfPageText,
} from "@/lib/pdf-analysis";

export class PdfInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfInputError";
  }
}

export function validatePdfFile(file: File) {
  const pdfType = file.type === "application/pdf";
  const pdfName = file.name.toLowerCase().endsWith(".pdf");
  if (!pdfType && !pdfName) {
    throw new PdfInputError("PDF 파일만 올릴 수 있어요.");
  }
  if (file.size <= 0) {
    throw new PdfInputError("비어 있는 파일은 분석할 수 없어요.");
  }
  if (file.size > MAX_PDF_BYTES) {
    throw new PdfInputError("PDF는 15MB 이하만 올릴 수 있어요.");
  }
}

export async function extractPdfText(
  file: File,
  onProgress?: (completedPages: number, totalPages: number) => void,
) {
  validatePdfFile(file);
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  let document;
  try {
    document = await pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      isEvalSupported: false,
    }).promise;
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "PasswordException") {
      throw new PdfInputError("암호가 설정된 PDF는 아직 분석할 수 없어요.");
    }
    throw new PdfInputError("PDF를 열지 못했어요. 손상되지 않은 파일인지 확인해 주세요.");
  }

  const pageCount = document.numPages;
  if (pageCount > MAX_PDF_PAGES) {
    await document.destroy();
    throw new PdfInputError(`PDF는 ${MAX_PDF_PAGES}쪽 이하만 분석할 수 있어요.`);
  }

  const charactersPerPage = Math.max(
    800,
    Math.min(5_000, Math.floor(MAX_ANALYSIS_CHARACTERS / pageCount)),
  );
  const pages: PdfPageText[] = [];
  let extractedCharacters = 0;

  try {
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      let pageText = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        pageText += item.str;
        pageText += "hasEOL" in item && item.hasEOL ? "\n" : " ";
      }
      const normalized = pageText
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
        .slice(0, charactersPerPage);
      extractedCharacters += normalized.length;
      pages.push({ pageNumber, text: normalized });
      page.cleanup();
      onProgress?.(pageNumber, pageCount);
    }
  } finally {
    await document.destroy();
  }

  if (extractedCharacters < Math.max(120, pageCount * 20)) {
    throw new PdfInputError(
      "읽을 수 있는 글자가 거의 없어요. 스캔 이미지 PDF의 OCR은 다음 단계에서 지원할 예정이에요.",
    );
  }

  return {
    pageCount,
    pages,
    extractedCharacters,
  };
}
