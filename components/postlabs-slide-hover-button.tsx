"use client";

import {
  type ButtonHTMLAttributes,
  useCallback,
  useMemo,
  useState,
} from "react";

const SLIDE_BAR_TRANSITION =
  "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)";

export type PostlabsSlideHoverVariant = "primary" | "outline-fill" | "outline-soft";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  variant: PostlabsSlideHoverVariant;
  children: React.ReactNode;
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
};

export function PostlabsSlideHoverButton({
  variant,
  children,
  className = "",
  disabled,
  onClick,
  type = "button",
  ...rest
}: Props) {
  const [hovered, setHovered] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const handleMove = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }, []);

  const slideBg = useMemo(() => {
    if (variant === "outline-soft") {
      return "rgba(37, 99, 235, 0.12)";
    }
    return "#2563EB";
  }, [variant]);

  const glare = useMemo(() => {
    if (variant === "outline-soft") {
      return "radial-gradient(circle, rgba(255,255,255,0.92) 0%, rgba(230,242,255,0.42) 45%, rgba(255,255,255,0) 72%)";
    }
    return "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)";
  }, [variant]);

  const activeGlow = hovered && !disabled;

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseMove={handleMove}
      className={`group relative inline-flex items-center justify-center overflow-hidden transition-all duration-300 ease-in-out disabled:cursor-not-allowed motion-reduce:transition-none ${className}`}
      {...rest}
    >
      <span className="relative z-30 pointer-events-none">{children}</span>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 h-full w-full motion-reduce:transition-none"
        style={{
          transformOrigin: "left",
          transform: activeGlow ? "scaleX(1)" : "scaleX(0)",
          transition: SLIDE_BAR_TRANSITION,
          backgroundColor: slideBg,
        }}
      />
      <div
        aria-hidden
        className={`
          pointer-events-none absolute -inset-y-6 left-0 z-20 w-1/2 -skew-x-12
          bg-gradient-to-r from-transparent via-white/35 to-transparent blur-[1px]
          transition-all duration-700 ease-out motion-reduce:hidden
          ${activeGlow ? "translate-x-[260%] opacity-100" : "-translate-x-[120%] opacity-0"}
        `}
      />
      <div
        aria-hidden
        className={`
          absolute -translate-x-1/2 -translate-y-1/2 h-24 w-24 rounded-full blur-2xl motion-reduce:transition-none md:h-32 md:w-32
          ${activeGlow ? "opacity-100" : "opacity-0"}
        `}
        style={{
          left: `${pos.x}px`,
          top: `${pos.y}px`,
          pointerEvents: "none",
          zIndex: 25,
          backgroundImage: glare,
          mixBlendMode: "soft-light",
          filter:
            "saturate(1.05) brightness(1.02) drop-shadow(0 0 8px rgba(255,255,255,0.12))",
          transition: "opacity 200ms ease-out",
        }}
      />
    </button>
  );
}
