import { useCallback, useState } from 'react';
import { useToast } from '../components/Toast';

/** "Extract and download the video of the current page", with the same feedback everywhere it is offered. */
export function useVideoDownload() {
  const { showToast } = useToast();
  const [isExtracting, setIsExtracting] = useState(false);

  const extract = useCallback(async (url?: string) => {
    if (!url || isExtracting) return;
    setIsExtracting(true);
    showToast('Recherche du flux vidéo en cours…', 'info');
    try {
      const res = await window.tora?.downloadVideo(url);
      if (res?.ok) showToast('Téléchargement de la vidéo démarré !', 'success');
      else if (res?.message) showToast(res.message, 'error');
      else showToast('Téléchargement initié.', 'success');
    } catch {
      showToast("Échec de l'extraction de la vidéo", 'error');
    } finally {
      setIsExtracting(false);
    }
  }, [isExtracting, showToast]);

  return { extract, isExtracting };
}
