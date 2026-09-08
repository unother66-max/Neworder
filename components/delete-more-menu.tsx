"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

const DELETE_MENU_OPEN_EVENT = "postlabs:delete-more-menu-open";
const MENU_WIDTH = 88;
const MENU_HEIGHT = 42;
const MENU_GAP = 6;
const VIEWPORT_PADDING = 8;

type DeleteMoreMenuProps = {
  disabled?: boolean;
  onDelete: () => void | Promise<void>;
  buttonLabel?: string;
  menuLabel?: string;
};

export function DeleteMoreMenu({
  disabled = false,
  onDelete,
  buttonLabel = "더보기",
  menuLabel = "항목 작업",
}: DeleteMoreMenuProps) {
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });

  const updatePosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const maxLeft = Math.max(
      VIEWPORT_PADDING,
      window.innerWidth - VIEWPORT_PADDING - MENU_WIDTH,
    );
    const left = Math.min(
      maxLeft,
      Math.max(VIEWPORT_PADDING, rect.right - MENU_WIDTH),
    );
    const belowTop = rect.bottom + MENU_GAP;
    const top =
      belowTop + MENU_HEIGHT <= window.innerHeight - VIEWPORT_PADDING
        ? belowTop
        : Math.max(VIEWPORT_PADDING, rect.top - MENU_GAP - MENU_HEIGHT);

    setPosition({ left, top });
  }, []);

  useEffect(() => {
    const closeWhenAnotherMenuOpens = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      if (customEvent.detail !== menuId) setOpen(false);
    };

    document.addEventListener(
      DELETE_MENU_OPEN_EVENT,
      closeWhenAnotherMenuOpens,
    );
    return () => {
      document.removeEventListener(
        DELETE_MENU_OPEN_EVENT,
        closeWhenAnotherMenuOpens,
      );
    };
  }, [menuId]);

  useEffect(() => {
    if (!open) return;

    const handleOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };

    updatePosition();
    document.addEventListener("pointerdown", handleOutsidePointer);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointer);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  const toggleMenu = () => {
    if (open) {
      setOpen(false);
      return;
    }

    updatePosition();
    document.dispatchEvent(
      new CustomEvent<string>(DELETE_MENU_OPEN_EVENT, { detail: menuId }),
    );
    setOpen(true);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-label={buttonLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        title={buttonLabel}
        onClick={toggleMenu}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border-0 bg-transparent p-0 text-[20px] font-semibold leading-none text-[#4b5563] transition-colors hover:bg-[#f3f4f6] hover:text-[#111827] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93c5fd] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span aria-hidden="true" className="-translate-y-px">
          ⋮
        </span>
      </button>

      {open
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label={menuLabel}
              className="fixed z-[1000] w-[88px] rounded-[10px] border border-[#e5e7eb] bg-white p-1 shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
              style={{ left: position.left, top: position.top }}
            >
              <button
                type="button"
                role="menuitem"
                disabled={disabled}
                onClick={() => {
                  setOpen(false);
                  void onDelete();
                }}
                className="flex h-8 w-full items-center rounded-[7px] px-2.5 text-left text-[12px] font-semibold text-[#374151] transition-colors hover:bg-[#fff7f7] hover:text-[#991b1b] focus-visible:bg-[#fff7f7] focus-visible:text-[#991b1b] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                {disabled ? "삭제 중..." : "삭제"}
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
