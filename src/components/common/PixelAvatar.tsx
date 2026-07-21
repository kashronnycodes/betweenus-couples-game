import { useEffect, useRef, useState } from "react";
import { getAvatar, type AvatarId } from "../../constants/avatars";

export interface PixelAvatarProps {
  avatarId: AvatarId;
  alt: string;
  size: "small" | "medium" | "large";
  priority?: boolean;
  className?: string;
}

export function PixelAvatar({ avatarId, alt, size, priority = false, className = "" }: PixelAvatarProps) {
  const avatar = getAvatar(avatarId);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "error">("loading");
  const startedAt = useRef(0);
  const performanceMark = useRef("");

  useEffect(() => {
    setLoadState("loading");
    startedAt.current = performance.now();
    performanceMark.current = `avatar-${avatarId}-${Math.random().toString(36).slice(2)}`;
    if (import.meta.env.DEV) performance.mark(`${performanceMark.current}-start`);
  }, [avatarId]);

  const handleLoad = (image: HTMLImageElement) => {
    setLoadState("loaded");
    if (import.meta.env.DEV) {
      performance.mark(`${performanceMark.current}-end`);
      performance.measure("avatar-load", `${performanceMark.current}-start`, `${performanceMark.current}-end`);
      const entry = performance.getEntriesByName(image.currentSrc).at(-1) as PerformanceResourceTiming | undefined;
      console.debug("[Between Us] Avatar loaded", {
        url: image.currentSrc,
        dimensions: `${image.naturalWidth}x${image.naturalHeight}`,
        encodedBytes: entry?.encodedBodySize,
        durationMs: Math.round(performance.now() - startedAt.current),
        cacheLikely: entry ? entry.transferSize === 0 : undefined,
      });
    }
  };

  const handleError = (url: string) => {
    setLoadState("error");
    if (import.meta.env.DEV) console.error(`[Between Us] Avatar failed to load: ${url}`);
  };

  return (
    <span className={`pixel-avatar pixel-avatar--${size} ${className}`} data-state={loadState}>
      {loadState !== "loaded" && <span className="pixel-avatar-placeholder" data-testid="avatar-placeholder" aria-hidden="true" />}
      {loadState !== "error" ? (
        <picture>
          <source
            type="image/webp"
            srcSet={`${avatar.sources[96]} 96w, ${avatar.sources[192]} 192w, ${avatar.sources[384]} 384w`}
            sizes={size === "small" ? "(max-width: 480px) 48px, 70px" : size === "medium" ? "(max-width: 480px) 96px, 128px" : "(max-width: 480px) 110px, 192px"}
          />
          <img
            src={avatar.fallback}
            alt={alt}
            width={192}
            height={288}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            decoding="async"
            draggable={false}
            onLoad={(event) => handleLoad(event.currentTarget)}
            onError={() => handleError(avatar.fallback)}
          />
        </picture>
      ) : (
        <span className="pixel-avatar-fallback" data-testid="avatar-fallback" role="img" aria-label={alt} />
      )}
    </span>
  );
}
