export const MAX_AVATAR_BYTES = 256 * 1024;
export const MAX_PROFILE_BODY_BYTES = 400 * 1024;

export class AvatarValidationError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export function decodeAvatar(value: string) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]*={0,2})$/.exec(value);

  if (!match || !match[2] || match[2].length % 4 !== 0) {
    throw new AvatarValidationError("Please upload a valid JPG, PNG, or WEBP image.");
  }

  if (match[2].length > Math.ceil(MAX_AVATAR_BYTES / 3) * 4) {
    throw new AvatarValidationError("Profile pictures must be 256 KB or smaller.");
  }

  const data = Buffer.from(match[2], "base64");

  if (data.length > MAX_AVATAR_BYTES || data.toString("base64") !== match[2]) {
    throw new AvatarValidationError("Invalid or oversized profile picture.");
  }

  const contentType = match[1];
  const valid =
    (contentType === "image/jpeg" && data.length >= 3 && data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) ||
    (contentType === "image/png" && data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ||
    (contentType === "image/webp" && data.length >= 12 && data.subarray(0, 4).equals(Buffer.from("RIFF")) && data.subarray(8, 12).equals(Buffer.from("WEBP")));

  if (!valid) {
    throw new AvatarValidationError("Image contents must match the JPG, PNG, or WEBP format.");
  }

  return { contentType, data };
}

export function parseProfileImage(value: string) {
  if (value === "") return { kind: "empty" as const };
  if (value.startsWith("data:")) {
    return { kind: "upload" as const, ...decodeAvatar(value) };
  }

  if (value.length > 500) {
    throw new AvatarValidationError("Image URL must be 500 characters or fewer.");
  }

  const relative = /^\/api\/avatars\/([A-Za-z0-9_-]+)$/.exec(value);
  if (relative) return { kind: "existing" as const, id: relative[1], url: value };

  try {
    const url = new URL(value);
    if (/^https?:\/\//i.test(value) && (url.protocol === "https:" || url.protocol === "http:") && url.hostname) {
      return { kind: "external" as const, url: value };
    }
  } catch {
    throw new AvatarValidationError("Please use a valid HTTP(S) image URL.");
  }

  throw new AvatarValidationError("Please use a valid HTTP(S) image URL.");
}

export async function readProfileBody(request: Request): Promise<unknown> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_PROFILE_BODY_BYTES) {
    throw new AvatarValidationError("Profile request is too large.", 413);
  }

  const reader = request.body?.getReader();
  if (!reader) throw new AvatarValidationError("Invalid JSON body.");

  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PROFILE_BODY_BYTES) {
        await reader.cancel();
        throw new AvatarValidationError("Profile request is too large.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  try {
    return JSON.parse(Buffer.concat(chunks, size).toString("utf8"));
  } catch {
    throw new AvatarValidationError("Invalid JSON body.");
  }
}
