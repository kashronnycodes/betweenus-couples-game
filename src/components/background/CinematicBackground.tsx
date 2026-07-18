import { useEffect, useRef } from "react";
import { BACKGROUND_VIDEO } from "../../constants/app";
export function CinematicBackground() {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    let raf = 0,
      timer = 0,
      ending = false;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tick = () => {
      if (!document.hidden && !reduced && v.duration) {
        const left = v.duration - v.currentTime;
        v.style.opacity = String(
          Math.max(0, Math.min(1, v.currentTime / 0.5, left / 0.5)),
        );
      }
      raf = requestAnimationFrame(tick);
    };
    const end = () => {
      if (ending || reduced) return;
      ending = true;
      v.style.opacity = "0";
      timer = window.setTimeout(() => {
        v.currentTime = 0;
        void v.play().catch(() => {});
        ending = false;
      }, 100);
    };
    const visible = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else {
        void v.play().catch(() => {});
        raf = requestAnimationFrame(tick);
      }
    };
    v.addEventListener("ended", end);
    document.addEventListener("visibilitychange", visible, { passive: true });
    void v.play().catch(() => {});
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      v.removeEventListener("ended", end);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  return (
    <>
      <video
        ref={ref}
        className="video"
        src={BACKGROUND_VIDEO}
        autoPlay
        muted
        playsInline
        preload="metadata"
        aria-hidden="true"
      />
      <div className="overlays" />
    </>
  );
}
