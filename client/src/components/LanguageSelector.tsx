import React, { useEffect, useRef, useState } from "react";
import { Globe, ChevronDown } from "lucide-react";
import { AppLanguage, languages, languageDescriptions } from "../utils/i18n";

interface LanguageSelectorProps {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
  variant: "topbar" | "login";
}

export function LanguageSelector({ language, setLanguage, variant }: LanguageSelectorProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeLanguage = languages.find((item) => item.id === language) ?? languages[0];

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const wrapperClass = variant === "login" ? "language-menu login-language-menu" : "language-menu";
  const buttonClass = variant === "login" ? `icon-button language ${open ? "open" : ""}` : `language ${open ? "open" : ""}`;
  const globeSize = variant === "login" ? 16 : 15;

  return (
    <div className={wrapperClass} data-no-translate ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className={buttonClass}
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <span className="language-leading">
          <Globe size={globeSize} />
          <strong>{activeLanguage.short}</strong>
        </span>
        <ChevronDown className="language-chevron" size={14} />
      </button>
      {open && (
        <div className="language-options" role="menu">
          {languages.map((item) => (
            <button
              className={item.id === language ? "active" : ""}
              key={item.id}
              onClick={() => {
                setLanguage(item.id);
                setOpen(false);
              }}
              role="menuitem"
              type="button"
            >
              <span>{item.short}</span>
              <div className="language-option-copy">
                <strong>{item.label}</strong>
                <small>{languageDescriptions[item.id]}</small>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
