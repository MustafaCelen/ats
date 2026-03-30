import { useState, useRef, useCallback } from "react";
import { Textarea } from "@/components/ui/textarea";
import { AtSign } from "lucide-react";
import type { PublicUser } from "@shared/schema";

export function MentionTextarea({
  value,
  onChange,
  assistants,
  placeholder,
  rows,
  className,
  "data-testid": testId,
}: {
  value: string;
  onChange: (v: string) => void;
  assistants: PublicUser[];
  placeholder?: string;
  rows?: number;
  className?: string;
  "data-testid"?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [suggestions, setSuggestions] = useState<PublicUser[]>([]);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const detectMention = useCallback((text: string, cursorPos: number) => {
    const before = text.slice(0, cursorPos);
    const match = before.match(/@(\w*)$/);
    if (match) {
      const query = match[1].toLowerCase();
      const filtered = assistants.filter((a) =>
        a.name.split(" ")[0].toLowerCase().startsWith(query)
      );
      setSuggestions(filtered);
      setMentionStart(before.length - match[0].length);
      setSelectedIdx(0);
    } else {
      setSuggestions([]);
      setMentionStart(null);
    }
  }, [assistants]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    detectMention(e.target.value, e.target.selectionStart ?? e.target.value.length);
  };

  const insertMention = (assistant: PublicUser) => {
    if (mentionStart === null) return;
    const firstName = assistant.name.split(" ")[0];
    const before = value.slice(0, mentionStart);
    const after = value.slice(textareaRef.current?.selectionStart ?? value.length);
    const newText = `${before}@${firstName} ${after}`;
    onChange(newText);
    setSuggestions([]);
    setMentionStart(null);
    setTimeout(() => {
      const pos = mentionStart + firstName.length + 2;
      textareaRef.current?.setSelectionRange(pos, pos);
      textareaRef.current?.focus();
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!suggestions.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, suggestions.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx((i) => Math.max(i - 1, 0)); }
    if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(suggestions[selectedIdx]); }
    if (e.key === "Escape") { setSuggestions([]); setMentionStart(null); }
  };

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        className={className}
        data-testid={testId}
      />
      {suggestions.length > 0 && (
        <div className="absolute z-50 left-0 mt-1 w-56 rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
          <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-b border-border">
            Asistan seç
          </div>
          {suggestions.map((a, i) => (
            <button
              key={a.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); insertMention(a); }}
              className={`w-full text-left flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                i === selectedIdx ? "bg-primary/10 text-primary" : "hover:bg-muted text-foreground"
              }`}
              data-testid={`mention-suggestion-${a.id}`}
            >
              <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <AtSign className="h-3 w-3 text-primary" />
              </div>
              <span className="font-medium">{a.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
