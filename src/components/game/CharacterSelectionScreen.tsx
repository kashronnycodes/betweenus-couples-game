import { Check } from "lucide-react";
import { AVATARS, type AvatarId } from "../../constants/avatars";
import { Button } from "../common/Button";
import { PixelAvatar } from "../common/PixelAvatar";

export function CharacterSelectionScreen({
  selected,
  onSelect,
  onContinue,
  onBack,
  busy,
  error,
}: {
  selected?: AvatarId;
  onSelect: (avatar: AvatarId) => void;
  onContinue: () => void;
  onBack: () => void;
  busy: boolean;
  error: string;
}) {
  return (
    <div className="max-w-3xl mx-auto pt-14 md:pt-0 text-center">
      <button className="glass-back-button" onClick={onBack} aria-label="Go back" title="Go back">
        <span aria-hidden="true">←</span>
      </button>
      <p className="eyebrow">Make it yours</p>
      <h1 className="font-serif text-[var(--text-title)] mt-2">Choose Your Character</h1>
      <p className="text-sm text-[var(--foreground-soft)] mt-3">
        This is how your partner will see you during the game.
      </p>
      <div role="radiogroup" aria-label="Choose your character" className="grid grid-cols-2 gap-3 md:gap-6 mt-7">
        {AVATARS.map((avatar) => {
          const active = selected === avatar.id;
          return (
            <button
              key={avatar.id}
              role="radio"
              aria-checked={active}
              className={`character-card ${active ? "selected" : ""}`}
              onClick={() => onSelect(avatar.id)}
            >
              {active && <span className="character-check"><Check size={16} /></span>}
              <div className="character-image-frame">
                <PixelAvatar avatarId={avatar.id} alt={avatar.name} size="large" priority className="character-image" />
              </div>
              <span className="font-serif text-xl md:text-2xl mt-3">{avatar.name}</span>
              <span className="eyebrow mt-1">{avatar.label}</span>
            </button>
          );
        })}
      </div>
      <Button className="w-full sm:w-auto mt-7" onClick={onContinue} disabled={!selected || busy}>
        {busy ? "Joining room…" : "Continue"}
      </Button>
      {error && <p className="mt-3 text-sm text-[var(--danger)]" role="alert">{error}</p>}
    </div>
  );
}
