import type { Block } from "@blocknote/core";
import { ChevronLeft, ChevronRight, List } from "lucide-react";
import { useMemo, useState } from "react";
import type { TocItem } from "../types";
import "./TableOfContents.css";

interface TableOfContentsProps {
  blocks: Block[];
  visible: boolean;
  onToggle: () => void;
}

function extractHeadings(blocks: Block[]): TocItem[] {
  const headings: TocItem[] = [];

  const traverse = (items: Block[]) => {
    for (const block of items) {
      if (block.type === "heading") {
        const level = (block.props as { level?: number })?.level || 1;
        const textContent = (block.content as { text?: string }[])
          ?.map((c) => c.text || "")
          .join("") || "";

        if (textContent.trim()) {
          headings.push({
            id: block.id,
            text: textContent,
            level,
          });
        }
      }
      if (block.children && block.children.length > 0) {
        traverse(block.children);
      }
    }
  };

  traverse(blocks);
  return headings;
}

export default function TableOfContents({
  blocks,
  visible,
  onToggle,
}: TableOfContentsProps) {
  const headings = useMemo(() => extractHeadings(blocks), [blocks]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const handleClick = (id: string) => {
    const element = document.querySelector(`[data-id="${id}"]`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const getIndentClass = (level: number) => {
    const indents: Record<number, string> = {
      1: "level-1",
      2: "level-2",
      3: "level-3",
      4: "level-4",
      5: "level-5",
      6: "level-6",
    };
    return indents[level] || "level-1";
  };

  return (
    <>
      {/* Toggle Button - Fixed Position (only when closed) */}
      {!visible && (
        <button className="toc-toggle-btn" onClick={onToggle} title="Open Table of Contents">
          <ChevronLeft className="toggle-icon" />
        </button>
      )}

      {/* Floating TOC Sidebar */}
      <div className={`toc-sidebar ${visible ? "open" : ""}`}>
        {/* Gradient Border */}
        <div className="toc-border-gradient" />

        <div className="toc-header">
          <div className="toc-header-title">
            <List className="toc-list-icon" />
            <h4>Table of Contents</h4>
          </div>
          <button className="toc-close-btn" onClick={onToggle} title="Close">
            <ChevronRight className="close-icon" />
          </button>
        </div>

        <div className="toc-body">
          {headings.length === 0 ? (
            <div className="toc-empty">
              <List className="toc-empty-icon" />
              <p>No headings found</p>
              <p className="toc-empty-hint">Add headings to see the table of contents</p>
            </div>
          ) : (
            <div className="toc-list">
              {headings.map((heading) => (
                <button
                  key={heading.id}
                  className={`toc-item ${getIndentClass(heading.level)} ${hoveredId === heading.id ? "hovered" : ""}`}
                  onClick={() => handleClick(heading.id)}
                  onMouseEnter={() => setHoveredId(heading.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  title={heading.text}
                >
                  <span className="toc-item-text">{heading.text}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
