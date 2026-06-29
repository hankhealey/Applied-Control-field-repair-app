"use client";

import * as React from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "warning" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "secondary",
      size = "md",
      loading = false,
      icon,
      children,
      disabled,
      className = "",
      ...props
    },
    ref,
  ) {
    const cls = ["btn", `btn-${variant}`, `btn-${size}`, className]
      .filter(Boolean)
      .join(" ");

    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled || loading}
        className={cls}
        {...props}
      >
        {loading ? (
          <Spinner />
        ) : icon ? (
          <span className="shrink-0">{icon}</span>
        ) : null}
        {children}
      </button>
    );
  },
);

function Spinner() {
  return (
    <svg
      className="animate-spin"
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="7"
        cy="7"
        r="5.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeOpacity="0.3"
      />
      <path
        d="M7 1.5A5.5 5.5 0 0 1 12.5 7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
