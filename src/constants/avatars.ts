export interface AvatarOption {
  id: string;
  name: string;
  label: string;
  path: string;
}

export const AVATARS = [
  { id: "male", name: "Male Character", label: "Male", path: "/avatars/male.png" },
  { id: "female", name: "Female Character", label: "Female", path: "/avatars/female.png" },
] as const satisfies readonly AvatarOption[];

export type AvatarId = (typeof AVATARS)[number]["id"];

export function getAvatar(id?: string) {
  return AVATARS.find((avatar) => avatar.id === id) ?? AVATARS[0];
}
