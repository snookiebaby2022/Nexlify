"use client";

import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";

export function TagInput({
  tags,
  onChange,
  placeholder = "Add…",
  inputMode = "text",
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  inputMode?: "text" | "numeric";
}) {
  const [draft, setDraft] = useState("");

  function commit(raw: string) {
    const v = raw.trim();
    if (!v) return;
    if (tags.includes(v)) {
      setDraft("");
      return;
    }
    onChange([...tags, v]);
    setDraft("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(draft);
    }
    if (e.key === "Backspace" && !draft && tags.length) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div className="xui-tag-input">
      {tags.map((tag) => (
        <span key={tag} className="xui-tag-input-tag">
          {tag}
          <button
            type="button"
            className="xui-tag-input-remove"
            aria-label={`Remove ${tag}`}
            onClick={() => onChange(tags.filter((t) => t !== tag))}
          >
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        type={inputMode === "numeric" ? "number" : "text"}
        className="xui-tag-input-field"
        value={draft}
        placeholder={tags.length ? "" : placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => commit(draft)}
      />
    </div>
  );
}
