import pdf from "pdf-parse/lib/pdf-parse.js";

/**
 * Extract plain text from a PDF buffer.
 * Returns "" on failure (encrypted, image-only, corrupt, etc.).
 */
export async function extractPdfText(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) return "";
  try {
    const data = await pdf(buffer, {
      // Limit work on e2-micro: first ~20 pages is enough for notices
      max: 20,
    });
    return (data.text || "").replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

export function isPdfDocument(message) {
  const doc = message?.documentMessage;
  if (!doc) return false;
  const name = (doc.fileName || "").toLowerCase();
  const mime = (doc.mimetype || "").toLowerCase();
  return mime.includes("pdf") || name.endsWith(".pdf");
}

export function getDocumentFileName(message) {
  return message?.documentMessage?.fileName || "";
}
