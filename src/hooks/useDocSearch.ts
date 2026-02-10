import { useCallback, useEffect, useRef, useState } from "react";
import { searchDocs, type SearchResult } from "../services/storage";

/** Shared search logic for both desktop and mobile search modals */
export function useDocSearch(isOpen: boolean) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults([]);
      setSearching(false);
    }
  }, [isOpen]);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!value.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await searchDocs(value.trim());
        setResults(data);
      } catch {
        setResults([]);
      }
      setSearching(false);
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return { query, results, searching, setQuery: handleQueryChange };
}
