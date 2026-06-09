"use client";

/**
 * CheckboxList — renders acknowledgment checkboxes for the SignatureModal.
 *
 * All items must be checked before onChange(true) fires.
 * Disabled until the parent confirms scroll is complete (disabled prop).
 *
 * Styled: navy background, gold accent on check state.
 */

import { useState, useEffect } from "react";

interface CheckboxListProps {
  items: string[];
  onChange: (allChecked: boolean) => void;
  disabled?: boolean;
}

export default function CheckboxList({
  items,
  onChange,
  disabled = false,
}: CheckboxListProps) {
  const [checked, setChecked] = useState<boolean[]>(
    () => new Array(items.length).fill(false)
  );

  // Notify parent whenever checked state changes
  useEffect(() => {
    const allChecked = checked.length > 0 && checked.every(Boolean);
    onChange(allChecked);
  }, [checked, onChange]);

  function toggle(index: number) {
    if (disabled) return;
    setChecked((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  }

  return (
    <fieldset
      className="space-y-3"
      aria-label="Acknowledgment checkboxes"
      disabled={disabled}
    >
      {disabled && (
        <p className="text-xs text-amber-400/80 font-body mb-3">
          Please scroll to the bottom of the agreement above to unlock the checkboxes.
        </p>
      )}

      {items.map((item, index) => {
        const id = `ack-checkbox-${index}`;
        const isChecked = checked[index] ?? false;

        return (
          <div
            key={index}
            className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
              disabled
                ? "border-white/10 bg-white/3 opacity-50 cursor-not-allowed"
                : isChecked
                ? "border-[#C9A84C]/40 bg-[#C9A84C]/8"
                : "border-white/15 bg-white/5 hover:border-white/25 cursor-pointer"
            }`}
            onClick={() => toggle(index)}
            role="none"
          >
            {/* Custom checkbox */}
            <div
              id={id}
              role="checkbox"
              aria-checked={isChecked}
              aria-disabled={disabled}
              tabIndex={disabled ? -1 : 0}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  toggle(index);
                }
              }}
              className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                disabled
                  ? "border-white/20 bg-transparent cursor-not-allowed"
                  : isChecked
                  ? "border-[#C9A84C] bg-[#C9A84C]"
                  : "border-white/40 bg-transparent hover:border-[#C9A84C]/60"
              }`}
            >
              {isChecked && (
                <svg
                  className="w-3 h-3 text-[#0A1628]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={3}
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
            </div>

            {/* Label */}
            <label
              htmlFor={id}
              className={`text-sm font-body leading-snug select-none ${
                disabled
                  ? "text-gray-500 cursor-not-allowed"
                  : isChecked
                  ? "text-white"
                  : "text-gray-300 cursor-pointer"
              }`}
              onClick={(e) => e.preventDefault()} // click handled by parent div
            >
              {item}
            </label>
          </div>
        );
      })}

      {/* All-checked indicator */}
      {!disabled && checked.every(Boolean) && checked.length > 0 && (
        <p className="text-xs text-green-400/80 font-body text-center pt-1">
          All acknowledgments confirmed
        </p>
      )}
    </fieldset>
  );
}
