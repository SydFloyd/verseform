import { useEffect, useMemo, useRef, useState } from "react";
import type { Translation } from "../app/ports";

const resultLimit = 100;

function searchableText(translation: Translation): string {
  return [
    translation.citationLabel,
    translation.id,
    translation.name,
    translation.vernacularName,
    translation.languageCode,
  ].filter(Boolean).join(" ").toLocaleLowerCase();
}

function optionLabel(translation: Translation): string {
  const vernacular = translation.vernacularName
    && translation.vernacularName !== translation.name
    ? ` · ${translation.vernacularName}`
    : "";
  return `${translation.citationLabel} — ${translation.name}${vernacular}`;
}

export function TranslationPicker({
  translations,
  selectedId,
  onSelect,
}: {
  translations: Translation[];
  selectedId: string;
  onSelect: (translationId: string) => void;
}) {
  const selected = translations.find((translation) => translation.id === selectedId)
    ?? translations[0];
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState(selected?.id);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const matching = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const filtered = normalized
      ? translations.filter((translation) => searchableText(translation).includes(normalized))
      : [
        ...(selected ? [selected] : []),
        ...translations.filter((translation) => translation.id !== selected?.id),
      ];
    return filtered.slice(0, resultLimit);
  }, [query, selected, translations]);

  useEffect(() => {
    if (!matching.some((translation) => translation.id === activeId)) {
      setActiveId(matching[0]?.id);
    }
  }, [activeId, matching]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      searchRef.current?.focus();
      searchRef.current?.select();
    });
  }, [open]);

  useEffect(() => {
    if (!open) setActiveId(selected?.id);
  }, [open, selected?.id]);

  const close = (returnFocus = false) => {
    setOpen(false);
    setQuery("");
    setActiveId(selected?.id);
    if (returnFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const choose = (translation: Translation) => {
    onSelect(translation.id);
    close(true);
  };

  const moveActive = (direction: 1 | -1) => {
    if (!matching.length) return;
    const current = matching.findIndex((translation) => translation.id === activeId);
    const next = current < 0
      ? direction > 0 ? 0 : matching.length - 1
      : (current + direction + matching.length) % matching.length;
    const nextId = matching[next].id;
    setActiveId(nextId);
    requestAnimationFrame(() => document.getElementById(`translation-option-${nextId}`)?.scrollIntoView({ block: "nearest" }));
  };

  return <div className="translation-picker" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) close();
  }}>
    <span className="translation-label">Scripture</span>
    <button
      ref={triggerRef}
      type="button"
      className="translation-trigger"
      aria-label={`Scripture translation: ${selected?.citationLabel ?? "Unavailable"}`}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls="translation-listbox"
      data-translation-id={selected?.id}
      onClick={() => {
        if (open) close();
        else setOpen(true);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          setOpen(true);
        }
      }}
    >{selected?.citationLabel ?? "—"}</button>
    {open ? <div className="translation-popover">
      <label className="translation-search-label" htmlFor="translation-search">Find a translation</label>
      <input
        ref={searchRef}
        id="translation-search"
        type="search"
        role="combobox"
        aria-label="Search translations"
        aria-autocomplete="list"
        aria-expanded="true"
        aria-controls="translation-listbox"
        aria-activedescendant={activeId ? `translation-option-${activeId}` : undefined}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            close(true);
          } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            moveActive(event.key === "ArrowDown" ? 1 : -1);
          } else if (event.key === "Enter") {
            const active = matching.find((translation) => translation.id === activeId);
            if (active) {
              event.preventDefault();
              choose(active);
            }
          }
        }}
      />
      <div id="translation-listbox" className="translation-listbox" role="listbox" aria-label="Available translations">
        {matching.map((translation) => <div
          id={`translation-option-${translation.id}`}
          key={translation.id}
          className="translation-option"
          role="option"
          aria-selected={translation.id === selected?.id}
          data-active={translation.id === activeId ? "true" : undefined}
          onMouseEnter={() => setActiveId(translation.id)}
          onMouseDown={(event) => {
            event.preventDefault();
            choose(translation);
          }}
        >{optionLabel(translation)}</div>)}
        {!matching.length ? <p className="translation-empty">No matching translations</p> : null}
      </div>
      {translations.length > resultLimit && !query.trim()
        ? <p className="translation-result-note">Showing the first {resultLimit}; type to narrow the list.</p>
        : null}
    </div> : null}
  </div>;
}
