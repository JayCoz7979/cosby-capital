/**
 * Button component with primary (navy/gold), secondary (outlined), and ghost variants.
 * Includes loading spinner state and proper disabled handling.
 */

import * as React from "react";
import { cn } from "@/lib/cn";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        aria-busy={loading}
        className={cn(
          // Base styles
          "inline-flex items-center justify-center gap-2 rounded-md font-medium font-body",
          "transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-60",
          // Size variants
          size === "sm" && "px-3 py-1.5 text-xs",
          size === "md" && "px-4 py-2 text-sm",
          size === "lg" && "px-6 py-3 text-base",
          // Color variants
          variant === "primary" && [
            "bg-[#2D5016] text-[#C9A84C]",
            "hover:bg-[#3d6b1e] active:bg-[#1a2e0d]",
            "focus:ring-[#C9A84C]",
          ],
          variant === "secondary" && [
            "bg-white text-[#2D5016] border border-[#2D5016]",
            "hover:bg-gray-50 active:bg-gray-100",
            "focus:ring-[#2D5016]",
          ],
          variant === "ghost" && [
            "bg-transparent text-[#2D5016]",
            "hover:bg-gray-100 active:bg-gray-200",
            "focus:ring-[#2D5016]",
          ],
          className
        )}
        {...props}
      >
        {loading && (
          <svg
            className="h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button };
