import { useEffect, useRef, useState } from "react";
import { searchDocs, type SearchResult } from "../services/storage";
import { FileText, Search, X } from "./Icons";
import "./SearchModal.css";

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
}

export default function SearchModal({ isOpen, onClose, onSelect }: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!value.trim()) return setResults([]);
      try {
        const data = await searchDocs(value.trim());
        setResults(data);
        setSelectedIndex(0);
      } catch {
        setResults([]);
      }
    }, 300);
  };

  const handleSelect = (id: string) => {
    onSelect(id);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      handleSelect(results[selectedIndex].id);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="search-modal-overlay" onClick={onClose}>
      <div className="search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="search-input-wrapper">
          <Search className="search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="search-input"
            placeholder="Search documents..."
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button className="close-btn" onClick={onClose}>
            <X className="icon-sm" />
          </button>
        </div>

        <div className="search-results">
          {!query && <div className="search-hint">Type to search documents</div>}
          {query && results.length === 0 && <div className="search-hint">No results found</div>}
          {results.map((result, index) => (
            <div
              key={result.id}
              className={`search-result-item ${index === selectedIndex ? "selected" : ""}`}
              onClick={() => handleSelect(result.id)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <FileText className="result-icon" />
              <div className="result-content">
                <div className="result-title">{result.title}</div>
                {result.matchType === "content" && <div className="result-match">{result.matchText}</div>}
              </div>
              <span className="result-type">{result.matchType}</span>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
