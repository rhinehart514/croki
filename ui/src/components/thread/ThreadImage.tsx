import { useEffect, useState } from "react";
import { getImageAttachment } from "@/api";

export function ThreadImage({ ventureId, imageId, name }: { ventureId: string; imageId: string; name: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void getImageAttachment(ventureId, imageId).then((result) => { if (active) setSrc(result.dataUrl); }, () => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [ventureId, imageId]);
  if (failed) return <span className="thread-message-image-error" role="img" aria-label={`${name} could not be loaded`}>{name}</span>;
  return src ? <img src={src} alt={name} /> : <span className="thread-message-image-loading" aria-label={`Loading ${name}`} />;
}
