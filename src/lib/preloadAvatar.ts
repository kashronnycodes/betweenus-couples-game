import { getAvatar, type AvatarId } from "../constants/avatars";

const activePreloads = new Map<AvatarId, Promise<void>>();

export function getAvatarPreloadUrl(avatarId: AvatarId) {
  return getAvatar(avatarId).sources[192];
}

export function preloadAvatar(avatarId: AvatarId): Promise<void> {
  const existing = activePreloads.get(avatarId);
  if (existing) return existing;
  if (typeof Image === "undefined") return Promise.resolve();
  const url = getAvatarPreloadUrl(avatarId);
  const promise = new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.onload = async () => {
      try {
        await image.decode?.();
      } catch {
        // A successful load is usable even when decode is unsupported or rejects.
      }
      resolve();
    };
    image.onerror = () => reject(new Error(`Avatar failed to load: ${url}`));
    image.src = url;
  });
  activePreloads.set(avatarId, promise);
  promise.catch(() => activePreloads.delete(avatarId));
  return promise;
}

export async function preloadAvatarsWithTimeout(avatarIds: AvatarId[], timeoutMs = 1200) {
  await Promise.race([
    Promise.allSettled(avatarIds.map(preloadAvatar)),
    new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs)),
  ]);
}
