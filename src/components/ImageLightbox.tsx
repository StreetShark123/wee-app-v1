import { useEffect } from "react";
import { createPortal } from "react-dom";
import { pick, useI18n } from "../lib/i18n";
import { Icon } from "./Icon";

// Visor de imagen a tamaño real (portal a body para escapar de transforms/overflow).
export const ImageLightbox = ({ url, onClose, showVisit = true }: { url: string; onClose: () => void; showVisit?: boolean }) => {
  const { language } = useI18n();
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onEsc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onEsc);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return createPortal(
    <div className="image-lightbox" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="image-lightbox-inner" onClick={(e) => e.stopPropagation()}>
        <img className="image-lightbox-img" src={url} alt="" />
        <div className="image-lightbox-actions">
          {showVisit ? (
            url.startsWith("data:") ? (
              // Imagen subida: no hay enlace externo y el navegador bloquea abrir un
              // data: en pestaña nueva → la descargamos en su lugar.
              <a className="btn" href={url} download="imagen.jpg">
                <Icon name="link" size={13} /> {pick(language, "Descargar imagen", "Download image", "Descargar imaxe")}
              </a>
            ) : (
              <a className="btn" href={url} target="_blank" rel="noopener noreferrer nofollow">
                <Icon name="link" size={13} /> {pick(language, "Visitar enlace original", "Visit original link", "Visitar ligazón orixinal")}
              </a>
            )
          ) : null}
          <button type="button" className="btn btn-primary" onClick={onClose}>
            {pick(language, "Cerrar", "Close", "Pechar")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
