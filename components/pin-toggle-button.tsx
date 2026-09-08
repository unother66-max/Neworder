"use client";

import type { ButtonHTMLAttributes, MouseEventHandler } from "react";

type PinToggleButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  | "aria-label"
  | "aria-pressed"
  | "children"
  | "className"
  | "disabled"
  | "onClick"
  | "title"
  | "type"
> & {
  pinned: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  pinnedLabel?: string;
  unpinnedLabel?: string;
};

export function PinToggleButton({
  pinned,
  onClick,
  disabled = false,
  pinnedLabel = "고정 해제",
  unpinnedLabel = "고정하기",
  ...buttonProps
}: PinToggleButtonProps) {
  const label = pinned ? pinnedLabel : unpinnedLabel;

  return (
    <button
      {...buttonProps}
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-transparent transition-colors hover:bg-[#f3f4f6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93c5fd] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 md:h-8 md:w-[30px] md:rounded-[10px] ${
        pinned ? "text-[#2563EB]" : "text-[#6b7280]"
      }`}
      aria-label={label}
      aria-pressed={pinned}
      title={label}
    >
      <span
        aria-hidden="true"
        className="block h-[18px] w-[14px] shrink-0 bg-current"
        style={{
          WebkitMaskImage: `url(${pinned ? "/icons/pin_enabled.svg" : "/icons/pin.svg"})`,
          maskImage: `url(${pinned ? "/icons/pin_enabled.svg" : "/icons/pin.svg"})`,
          WebkitMaskPosition: "center",
          maskPosition: "center",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskSize: "contain",
          maskSize: "contain",
        }}
      />
    </button>
  );
}

export function PinnedStatusIcon() {
  return (
    <span
      aria-hidden="true"
      className="block h-[18px] w-[14px] shrink-0 bg-[#2563EB]"
      style={{
        WebkitMaskImage: 'url("/icons/pin_enabled.svg")',
        maskImage: 'url("/icons/pin_enabled.svg")',
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
        maskSize: "contain",
      }}
    />
  );
}
