"use client";

import { useEffect, useRef, useState } from "react";

interface Hit {
  name: string;
  postCount: number;
  category: string;
  viaAlias?: string;
}

function normalize(raw: string): string {
  let s = raw.trim().toLowerCase().replace(/\s+/g, "_");
  s = s.replace(/[^\x21-\x7e]/g, "");
  s = s.replace(/_{2,}/g, "_").replace(/^_+|_+$/g, "");
  return s.length && s.length <= 100 ? s : "";
}

const COMMIT_KEYS = new Set([" ", ",", "Enter", "Tab"]);

/**
 * Booru tag entry: type-ahead autocomplete + paste Gelbooru-style
 * space-separated lists (auto-split). Value submitted as a hidden input.
 */
export default function TagInput({
  name,
  defaultValue = "",
  placeholder = "type tags, or paste a whole tag list…",
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  const [chips, setChips] = useState<string[]>(() =>
    defaultValue.split(/\s+/).map(normalize).filter(Boolean),
  );
  const [text, setText] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [highlight, setHighlight] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const commit = (raw: string) => {
    const tag = normalize(raw);
    if (tag && !chips.includes(tag)) setChips((c) => [...c, tag]);
    setText("");
    setHits([]);
    setHighlight(-1);
  };

  useEffect(() => {
    if (!text.trim()) return; // dropdown hidden via render guard; hits cleared on commit
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tags/autocomplete?q=${encodeURIComponent(text)}`);
        setHits(res.ok ? await res.json() : []);
        setHighlight(-1);
      } catch {
        setHits([]);
      }
    }, 150);
    return () => clearTimeout(debounce.current);
  }, [text]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (COMMIT_KEYS.has(e.key)) {
      if (e.key === "Enter" && highlight >= 0 && hits[highlight]) {
        e.preventDefault();
        commit(hits[highlight].name);
        return;
      }
      if (text.trim()) {
        e.preventDefault();
        commit(text);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, -1));
    } else if (e.key === "Backspace" && !text && chips.length) {
      setChips((c) => c.slice(0, -1));
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const data = e.clipboardData.getData("text");
    if (/\s/.test(data)) {
      e.preventDefault();
      data.split(/[\s,]+/).forEach(commit);
    }
  };

  return (
    <div className="relative">
      <input type="hidden" name={name} value={chips.join(" ")} />
      <div
        className="flex min-h-11 cursor-text flex-wrap items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 focus-within:border-sky-500"
        onClick={() => inputRef.current?.focus()}
      >
        {chips.map((chip) => (
          <span
            key={chip}
            className="flex items-center gap-1 rounded bg-zinc-800 px-2 py-0.5 text-xs"
          >
            {chip}
            <button
              type="button"
              aria-label={`remove ${chip}`}
              className="text-zinc-500 hover:text-red-400"
              onClick={() => setChips((c) => c.filter((t) => t !== chip))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          className="min-w-32 flex-1 bg-transparent text-sm outline-none"
          value={text}
          placeholder={chips.length ? "" : placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      {text.trim() && hits.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded border border-zinc-700 bg-zinc-900 shadow-xl">
          {hits.map((hit, i) => (
            <li key={hit.name}>
              <button
                type="button"
                className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm ${
                  i === highlight ? "bg-zinc-800" : "hover:bg-zinc-800"
                }`}
                onClick={() => commit(hit.name)}
              >
                <span>
                  {hit.name}
                  {hit.viaAlias && (
                    <span className="ml-2 text-xs text-zinc-500">(alias of)</span>
                  )}
                </span>
                <span className="text-xs text-zinc-500">{hit.postCount}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
