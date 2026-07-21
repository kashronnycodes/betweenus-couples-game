export interface AvatarOption {
  id: "male" | "female";
  name: string;
  label: string;
  /** Kept for the existing multiplayer database contract. UI rendering uses sources. */
  path: string;
  fallback: string;
  sources: Record<96 | 192 | 384, string>;
  aspectRatio: number;
}

export const AVATARS = [
  {
    id: "male", name: "Male Character", label: "Male", path: "/avatars/male.png",
    fallback: "/avatars/generated/male-192.png",
    sources: { 96: "/avatars/generated/male-96.webp", 192: "/avatars/generated/male-192.webp", 384: "/avatars/generated/male-384.webp" },
    aspectRatio: 2 / 3,
  },
  {
    id: "female", name: "Female Character", label: "Female", path: "/avatars/female.png",
    fallback: "/avatars/generated/female-192.png",
    sources: { 96: "/avatars/generated/female-96.webp", 192: "/avatars/generated/female-192.webp", 384: "/avatars/generated/female-384.webp" },
    aspectRatio: 2 / 3,
  },
] as const satisfies readonly AvatarOption[];

export type AvatarId = (typeof AVATARS)[number]["id"];

export function getAvatar(id?: string) {
  return AVATARS.find((avatar) => avatar.id === id) ?? AVATARS[0];
}
