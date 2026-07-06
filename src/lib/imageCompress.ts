// Compresión de imágenes en el cliente ANTES de guardarlas como base64 en la
// BD. Lección aprendida (2026-07): dos avatares sin comprimir (3,8 y 2,6 MB)
// viajando en cada respuesta de la API agotaron la cuota de egress del proyecto.
// TODA subida de imagen pasa por aquí — única fuente de verdad.

/** Avatares: thumbnail pequeño (se pinta a 24-74px). Viaja EMBEBIDO (base64) en
 *  cada payload de lista/feed/notificación, así que se guarda contenido: 96px
 *  cubre el uso real con retina razonable y pesa ~4× menos que 192. */
export const AVATAR_MAX_PX = 96;
/** Imágenes de contenido (notas de capítulo): legibles pero contenidas. */
export const CONTENT_IMG_MAX_PX = 1200;

const JPEG_QUALITY = 0.82;

export const imageFileToDataUrl = (file: File, maxPx: number): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      // Si el navegador no puede decodificarla, guarda el original: el
      // backend tiene tope de tamaño como última barrera.
      img.onerror = () => resolve(dataUrl);
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(dataUrl);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
