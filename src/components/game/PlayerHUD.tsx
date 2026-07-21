import { motion } from "framer-motion";
import { getAvatar } from "../../constants/avatars";
import { PixelAvatar } from "../common/PixelAvatar";

export interface HUDPlayer {
  display_name: string;
  avatar_type: string;
  avatar_path: string;
  score: number;
  connected: boolean;
}

export function PlayerHUD({
  player,
  side,
  completedRounds,
}: {
  player?: HUDPlayer;
  side: "left" | "right";
  completedRounds: number;
}) {
  if (!player) return <div className="player-hud player-hud-empty" aria-hidden="true" />;
  const avatar = getAvatar(player.avatar_type);
  const meter = Math.max(0, Math.min(10, 5 + player.score * 2 - completedRounds));
  const reverse = side === "right";
  return (
    <section className={`player-hud player-hud-${side}`} aria-label={`${player.display_name}, score ${meter} out of 10`}>
      <PixelAvatar avatarId={avatar.id} alt="" size="small" priority className="hud-avatar" />
      <div className={`hud-copy ${reverse ? "text-right" : "text-left"}`}>
        <div className={`flex items-center gap-2 ${reverse ? "justify-end" : ""}`}>
          <span className={`status-pin ${player.connected ? "connected" : ""}`} />
          <span className="eyebrow truncate">{player.display_name}</span>
        </div>
        <motion.p key={meter} initial={{ opacity: 0.4, y: 3 }} animate={{ opacity: 1, y: 0 }} className="hud-score">
          {meter} <span>/ 10</span>
        </motion.p>
        <div className={`hud-segments ${reverse ? "hud-segments-reverse" : ""}`} aria-hidden="true">
          {Array.from({ length: 10 }, (_, index) => (
            <motion.i
              key={index}
              animate={{ opacity: index < meter ? 1 : 0.38, scaleY: index < meter ? 1 : 0.78 }}
              transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
              className={index < meter ? "filled" : ""}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
