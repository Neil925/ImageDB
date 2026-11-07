"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import TagInput from "./TagInput";

interface Notice {
  kind: "ok" | "err";
  text: string;
  postId?: number;
}

const RATINGS = ["general", "sensitive", "questionable", "explicit"] as const;

export default function UploadForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const pickFile = (f: File | undefined | null) => {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setNotice(null);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !formRef.current) return;
    setBusy(true);
    setNotice(null);
    try {
      const fd = new FormData(formRef.current);
      fd.set("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const body = await res.json();
      if (res.ok) {
        setNotice({
          kind: "ok",
          text: body.tagged ? "Post published." : "Uploaded - untagged, waiting in the queue.",
          postId: body.postId,
        });
        setFile(null);
        setPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        formRef.current.querySelectorAll("input[type=text]").forEach((i) => ((i as HTMLInputElement).value = ""));
      } else {
        setNotice({
          kind: "err",
          text: body.error ?? "upload failed",
          postId: body.postId,
        });
      }
    } catch {
      setNotice({ kind: "err", text: "network error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-4">
      <div
        className={`flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-4 text-center ${
          dragOver ? "border-sky-500 bg-sky-950/40" : "border-zinc-700"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          pickFile(e.dataTransfer.files[0]);
        }}
      >
        {preview ? (
          <img src={preview} alt="preview" className="max-h-56 max-w-full rounded" />
        ) : (
          <p className="text-zinc-500">drag an image here, or</p>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
          className="text-sm text-zinc-400"
          onChange={(e) => pickFile(e.target.files?.[0])}
        />
        {file && <p className="text-xs text-zinc-500">{file.name}</p>}
      </div>

      <div>
        <span className="mb-1 block text-sm text-zinc-400">Tags</span>
        <TagInput name="tags" />
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1 text-sm text-zinc-400">
          Rating
          <select
            name="rating"
            defaultValue="general"
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5"
          >
            {RATINGS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm text-zinc-400">
          Source URL (optional)
          <input
            type="text"
            name="source_url"
            placeholder="https://…"
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-zinc-100"
          />
        </label>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={!file || busy}
          className="rounded bg-sky-600 px-5 py-2 text-sm font-medium hover:bg-sky-500 disabled:opacity-40"
        >
          {busy ? "Uploading…" : "Upload"}
        </button>
        {notice && (
          <p className={`text-sm ${notice.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>
            {notice.text}{" "}
            {notice.postId && (
              <Link href={`/posts/${notice.postId}`} className="underline">
                post #{notice.postId}
              </Link>
            )}
          </p>
        )}
      </div>
    </form>
  );
}
