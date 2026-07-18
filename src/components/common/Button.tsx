import type { ButtonHTMLAttributes, ReactNode } from "react";
export function Button({
  variant = "primary",
  children,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet";
  children: ReactNode;
}) {
  return (
    <button className={`btn btn-${variant}`} {...p}>
      {children}
    </button>
  );
}
