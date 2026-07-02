"use client";

import { useRef } from "react";
import db from "@/lib/db";
import type { PhotoCategory, RepairPhoto } from "@/lib/types";

function resizeImage(
  file: File,
  maxEdge = 1600,
  quality = 0.8,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxEdge) {
          height = (height * maxEdge) / width;
          width = maxEdge;
        } else if (height > maxEdge) {
          width = (width * maxEdge) / height;
          height = maxEdge;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no canvas context"));
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function PhotoUploader({
  reportId,
  category,
  photos,
}: {
  reportId: string;
  category: PhotoCategory;
  photos: RepairPhoto[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const categoryPhotos = photos.filter((p) => p.photoCategory === category);

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      const dataUrl = await resizeImage(file);
      await db.photos.add({
        id: crypto.randomUUID(),
        repairReportId: reportId,
        photo: dataUrl,
        photoCategory: category,
        caption: "",
        sequenceNumber: categoryPhotos.length + 1,
      });
    }
  }

  async function handleCaption(id: string, caption: string) {
    await db.photos.update(id, { caption });
  }

  async function handleDelete(id: string) {
    await db.photos.delete(id);
  }

  return (
    <div className="mb-5">
      <p className="mb-2 text-sm font-semibold text-[var(--text-secondary)]">{category}</p>
      <button type="button"
        onClick={() => inputRef.current?.click()}
        className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-3 text-sm font-semibold text-white"
      >
        📷 Take / Add Photo ({category})
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {categoryPhotos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--border-solid)] py-6 text-center text-sm text-[var(--text-secondary)]">
          No photos yet for this category.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {categoryPhotos.map((p) => (
            <div key={p.id} className="rounded-lg border border-[var(--border-solid)] p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.photo}
                alt={p.caption || category}
                className="mb-2 h-28 w-full rounded object-cover"
              />
              <input
                className="input mb-1 text-xs"
                placeholder="Caption"
                defaultValue={p.caption}
                onBlur={(e) => handleCaption(p.id, e.target.value)}
              />
              <button type="button"
                onClick={() => handleDelete(p.id)}
                className="w-full text-xs text-red-600"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
