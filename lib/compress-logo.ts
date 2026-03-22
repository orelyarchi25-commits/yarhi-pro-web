import { MAX_LOGO_CHARS } from "@/lib/user-workspace-firestore";

/** יעד בטוח מתחת ל־trimWorkspaceForSize */
const TARGET_MAX_CHARS = Math.floor(MAX_LOGO_CHARS * 0.88);

/**
 * מקטין תמונה ל־JPEG כדי שייכנס לענן (Firestore) ויסנכרן בין מכשירים.
 * ללא זה — לוגו גדול נשמר רק ב-localStorage במכשיר הנוכחי.
 */
export async function compressImageFileToDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("טעינת התמונה נכשלה"));
      i.src = url;
    });

    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error("ממדי תמונה לא תקינים");

    const maxSide = 1280;
    if (w > maxSide || h > maxSide) {
      const r = Math.min(maxSide / w, maxSide / h);
      w = Math.round(w * r);
      h = Math.round(h * r);
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas לא זמין");
    ctx.drawImage(img, 0, 0, w, h);

    let quality = 0.88;
    let dataUrl = canvas.toDataURL("image/jpeg", quality);
    while (dataUrl.length > TARGET_MAX_CHARS && quality > 0.42) {
      quality -= 0.07;
      dataUrl = canvas.toDataURL("image/jpeg", quality);
    }

    let scale = 0.9;
    while (dataUrl.length > TARGET_MAX_CHARS && scale > 0.25) {
      w = Math.max(64, Math.round(w * scale));
      h = Math.max(64, Math.round(h * scale));
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);
      quality = 0.82;
      dataUrl = canvas.toDataURL("image/jpeg", quality);
      while (dataUrl.length > TARGET_MAX_CHARS && quality > 0.42) {
        quality -= 0.07;
        dataUrl = canvas.toDataURL("image/jpeg", quality);
      }
      scale -= 0.08;
    }

    if (dataUrl.length > MAX_LOGO_CHARS) {
      throw new Error("LOGO_TOO_LARGE");
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(url);
  }
}
