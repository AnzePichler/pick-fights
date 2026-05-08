// app/account/AccountForm.tsx
"use client";

import { ChangeEvent, FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type AccountUser = {
  email: string;
  username: string;
  displayName: string | null;
  imageUrl: string | null;
};

type Props = {
  user: AccountUser;
};

export default function AccountForm({ user }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [displayName, setDisplayName] = useState(
    user.displayName || user.username,
  );

  const [imageUrl, setImageUrl] = useState(user.imageUrl || "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setError(null);

    try {
      const compressedImage = await compressImageToDataUrl(file);
      setImageUrl(compressedImage);
    } catch (error) {
      console.error(error);
      setError("Could not use that image. Try a smaller JPG, PNG, or WEBP.");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError(null);
    setIsSaving(true);

    try {
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          displayName,
          imageUrl,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to save account.");
        return;
      }

      router.refresh();
    } catch (error) {
      console.error(error);
      setError("Failed to save account.");
    } finally {
      setIsSaving(false);
    }
  }

  const shownName = displayName.trim() || user.username;
  const initials = getInitials(shownName);

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error && (
        <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-col items-center gap-4">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="group relative h-40 w-40 overflow-hidden rounded-full bg-neutral-200 shadow-inner"
          aria-label="Change profile picture"
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={shownName}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-5xl font-black text-neutral-500">
              {initials}
            </div>
          )}

          <div className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-100 transition group-hover:bg-black/45">
            <div className="rounded-2xl border-2 border-white px-4 py-3 text-4xl text-white">
              📷
            </div>
          </div>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleImageChange}
          className="hidden"
        />

        {imageUrl && (
          <button
            type="button"
            onClick={() => setImageUrl("")}
            className="text-sm font-bold text-neutral-500 transition hover:text-red-600"
          >
            Remove picture
          </button>
        )}
      </div>

      <div className="mx-auto max-w-md space-y-2">
        <label
          htmlFor="displayName"
          className="text-sm font-black text-neutral-700"
        >
          Display name
        </label>

        <input
          id="displayName"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          minLength={1}
          maxLength={30}
          className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-center font-bold outline-none transition focus:border-blue-500 focus:bg-white"
        />

        <p className="text-center text-xs font-semibold text-neutral-400">
          Login username: @{user.username}
        </p>
      </div>

      <div className="flex justify-center">
        <button
          type="submit"
          disabled={isSaving}
          className="rounded-xl bg-[#2b7fff] px-8 py-3 font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-400"
        >
          {isSaving ? "Saving..." : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return "?";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("File is not an image."));
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const image = new Image();

      image.onload = () => {
        const size = 512;
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        if (!context) {
          reject(new Error("Could not create canvas context."));
          return;
        }

        canvas.width = size;
        canvas.height = size;

        const sourceSize = Math.min(image.width, image.height);
        const sourceX = (image.width - sourceSize) / 2;
        const sourceY = (image.height - sourceSize) / 2;

        context.drawImage(
          image,
          sourceX,
          sourceY,
          sourceSize,
          sourceSize,
          0,
          0,
          size,
          size,
        );

        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);

        if (dataUrl.length > 750_000) {
          reject(new Error("Image is too large."));
          return;
        }

        resolve(dataUrl);
      };

      image.onerror = () => {
        reject(new Error("Could not load image."));
      };

      image.src = String(reader.result);
    };

    reader.onerror = () => {
      reject(new Error("Could not read file."));
    };

    reader.readAsDataURL(file);
  });
}
