import { Globe } from 'lucide-react';
import { useState, useEffect } from 'react';

interface FaviconProps {
  src?: string;
  size?: number;
  className?: string;
}

// Single source of truth for showing a site's favicon with a clean fallback — used
// everywhere a site is represented (history, bookmarks, downloads, tab strips) so the
// behavior (and the fallback icon) stays consistent across the whole app.
export default function Favicon({ src, size = 14, className = '' }: FaviconProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [src]);

  if (!src || failed) {
    return <Globe size={size} className={`text-subtle ${className}`} strokeWidth={1.75} />;
  }

  return (
    <img
      src={src}
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
      className={`rounded-sm object-contain ${className}`}
      alt=""
    />
  );
}
