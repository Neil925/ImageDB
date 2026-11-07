"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import TagInput from "./TagInput";

export function PostTagEditor({ postId }: { postId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setBusy(true);
    setSaved(false);
    try {
      const form = document.getElementById(`tag-edit-${postId}`) as HTMLFormElement | null;
      if (!form) return;
      const tags = new FormData(form).get("tags");
      await fetch(`/api/posts/${postId}/tags`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: String(tags ?? "") }),
      });
      router.refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form id={`tag-edit-${postId}`} className="flex flex-col gap-2">
      <TagInput name="tags" placeholder="add tags or paste a tag list…" />
      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="self-start rounded bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700 disabled:opacity-40"
      >
        {busy ? "Saving…" : saved ? "Saved ✓" : "Add tags"}
      </button>
    </form>
  );
}

export function PostActions({
  postId,
  status,
}: {
  postId: number;
  status: "active" | "pending" | "deleted";
}) {
  const router = useRouter();
  const act = async (action: string) => {
    await fetch(`/api/posts/${postId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    router.refresh();
  };

  return (
    <div className="flex gap-2 text-sm">
      {status === "active" && (
        <button
          onClick={() => act("hide")}
          className="rounded bg-yellow-800/70 px-3 py-1.5 hover:bg-yellow-700/70"
        >
          Hide (unlist)
        </button>
      )}
      {status !== "deleted" && (
        <button
          onClick={() => act("delete")}
          className="rounded bg-red-900/70 px-3 py-1.5 hover:bg-red-800/70"
        >
          Delete
        </button>
      )}
      {status !== "active" && (
        <button
          onClick={() => act("restore")}
          className="rounded bg-emerald-900/70 px-3 py-1.5 hover:bg-emerald-800/70"
        >
          Restore
        </button>
      )}
    </div>
  );
}
