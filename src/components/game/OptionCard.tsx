import { Check, ArrowUpRight } from "lucide-react";
import type { Choice } from "../../types/game";
export function OptionCard({
  id,
  text,
  selected,
  onSelect,
}: {
  id: Choice;
  text: string;
  selected: boolean;
  onSelect: (c: Choice) => void;
}) {
  return (
    <button
      role="radio"
      aria-checked={selected}
      className={`option ${selected ? "selected" : ""}`}
      onClick={() => onSelect(id)}
    >
      <span className="eyebrow mt-1">{id}</span>
      <span className="text-lg leading-snug flex-1">{text}</span>
      {selected ? <Check size={19} /> : <ArrowUpRight size={18} aria-hidden />}
    </button>
  );
}
