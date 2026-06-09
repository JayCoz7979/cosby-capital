"use client";

/**
 * AgreementViewer — scrollable document viewer with scroll enforcement.
 *
 * Uses IntersectionObserver to watch a sentinel element at the bottom of the
 * document. Once the sentinel enters the viewport, onScrolledToBottom() fires
 * and the parent can enable the "Continue" button.
 *
 * Also renders a thin gold scroll-progress bar at the top of the viewer.
 */

import { useRef, useEffect, useState, useCallback } from "react";

interface AgreementViewerProps {
  text: string;
  onScrolledToBottom: () => void;
}

export default function AgreementViewer({
  text,
  onScrolledToBottom,
}: AgreementViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [reachedBottom, setReachedBottom] = useState(false);
  const onScrolledToBottomRef = useRef(onScrolledToBottom);

  // Keep callback ref current without re-running effects
  useEffect(() => {
    onScrolledToBottomRef.current = onScrolledToBottom;
  }, [onScrolledToBottom]);

  // Track scroll progress and update the gold progress bar
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const scrollTop = el.scrollTop;
    const scrollHeight = el.scrollHeight - el.clientHeight;
    const progress = scrollHeight > 0 ? Math.min(scrollTop / scrollHeight, 1) : 0;
    setScrollProgress(progress);

    if (scrollTop > 0) {
      setHasScrolled(true);
    }
  }, []);

  // IntersectionObserver watches the bottom sentinel
  useEffect(() => {
    const sentinel = bottomRef.current;
    const container = containerRef.current;
    if (!sentinel || !container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry && entry.isIntersecting && !reachedBottom) {
          setReachedBottom(true);
          onScrolledToBottomRef.current();
        }
      },
      {
        root: container,
        threshold: 0.1, // fires when 10% of sentinel is visible
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [reachedBottom]);

  // Parse the agreement text into rendered sections
  const renderAgreementText = (rawText: string) => {
    const lines = rawText.split("\n");
    const elements: React.ReactNode[] = [];

    lines.forEach((line, index) => {
      const trimmed = line.trim();

      if (trimmed === "") {
        elements.push(<div key={index} className="h-2" />);
      } else if (trimmed.startsWith("━")) {
        elements.push(
          <hr key={index} className="border-0 border-t border-white/20 my-3" />
        );
      } else if (
        trimmed === trimmed.toUpperCase() &&
        trimmed.length > 5 &&
        !trimmed.startsWith("─") &&
        !trimmed.match(/^\d/)
      ) {
        // All-caps lines = section headings
        elements.push(
          <h3
            key={index}
            className="text-sm font-semibold text-[#C9A84C] mt-4 mb-2 font-body tracking-wide"
          >
            {trimmed}
          </h3>
        );
      } else if (trimmed.match(/^SECTION \d/)) {
        elements.push(
          <h3
            key={index}
            className="text-sm font-semibold text-[#C9A84C] mt-4 mb-1 font-body"
          >
            {trimmed}
          </h3>
        );
      } else if (trimmed.match(/^\d+\.\d+\s/)) {
        // Numbered subsections like "1.1 Services..."
        elements.push(
          <p key={index} className="text-sm text-gray-200 mt-2 mb-1 font-body leading-relaxed">
            {trimmed}
          </p>
        );
      } else if (trimmed.match(/^[A-Z]+ AMOUNT/) || trimmed.match(/^─+/)) {
        // Table headers / dividers
        elements.push(
          <p key={index} className="text-xs text-gray-400 font-mono mt-1">
            {trimmed}
          </p>
        );
      } else if (trimmed.match(/^\$|Under \$|^\d+%/)) {
        // Fee table rows
        elements.push(
          <p key={index} className="text-xs text-gray-300 font-mono ml-2">
            {trimmed}
          </p>
        );
      } else {
        elements.push(
          <p key={index} className="text-sm text-gray-300 font-body leading-relaxed mb-1">
            {trimmed}
          </p>
        );
      }
    });

    return elements;
  };

  return (
    <div className="relative">
      {/* Scroll progress bar */}
      <div className="relative h-1 w-full bg-white/10 rounded-full overflow-hidden mb-2">
        <div
          className="absolute left-0 top-0 h-full bg-[#C9A84C] transition-all duration-150 ease-out rounded-full"
          style={{ width: `${scrollProgress * 100}%` }}
          role="progressbar"
          aria-valuenow={Math.round(scrollProgress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Reading progress"
        />
      </div>

      {/* "Scroll to read all" hint */}
      {!hasScrolled && (
        <p className="text-xs text-[#C9A84C]/80 font-body text-center mb-2 animate-pulse">
          Scroll to read all — required before signing
        </p>
      )}

      {/* Scrollable document container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="max-h-[400px] overflow-y-auto rounded-xl border border-white/15 bg-white/5 p-5 space-y-0.5 scroll-smooth"
        tabIndex={0}
        aria-label="Agreement document — scroll to read"
        role="document"
      >
        {renderAgreementText(text)}

        {/* Bottom sentinel — IntersectionObserver target */}
        <div
          ref={bottomRef}
          className="h-px w-full"
          aria-hidden="true"
          data-testid="agreement-bottom-sentinel"
        />
      </div>

      {/* Bottom indicator */}
      {reachedBottom && (
        <p className="text-xs text-green-400/80 font-body text-center mt-2">
          You have read the full agreement
        </p>
      )}
    </div>
  );
}
