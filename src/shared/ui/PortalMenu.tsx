import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

type PortalMenuProps = {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
  /** Menu width in px. Defaults to 208 (w-52). */
  width?: number;
  className?: string;
};

type Coords = { top: number; left: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Renders a dropdown via portal + fixed positioning so it overlays scrollable /
 * overflow-hidden ancestors instead of expanding them and causing scrollbars.
 */
export function PortalMenu({
  open,
  anchorRef,
  onClose,
  children,
  width = 208,
  className = "",
}: PortalMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<Coords | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }

    const update = () => {
      const anchor = anchorRef.current;
      const menu = menuRef.current;
      if (!anchor) return;

      const rect = anchor.getBoundingClientRect();
      const menuHeight = menu?.offsetHeight ?? 0;
      const gap = 4;
      const pad = 8;

      let top = rect.bottom + gap;
      if (menuHeight > 0 && top + menuHeight > window.innerHeight - pad) {
        const above = rect.top - gap - menuHeight;
        if (above >= pad) top = above;
      }

      let left = rect.right - width;
      left = clamp(left, pad, window.innerWidth - width - pad);

      setCoords({ top, left });
    };

    update();
    // Re-measure after paint once menu height is known (for flip-up).
    const raf = requestAnimationFrame(update);

    window.addEventListener("resize", update);
    // Capture scroll on any ancestor so the menu tracks the trigger.
    window.addEventListener("scroll", update, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchorRef, width]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: "fixed",
        top: coords?.top ?? -9999,
        left: coords?.left ?? -9999,
        width,
        visibility: coords ? "visible" : "hidden",
        zIndex: 9999,
      }}
      className={
        "rounded-lg border border-zinc-200 bg-white shadow-lg overflow-hidden " +
        className
      }
    >
      {children}
    </div>,
    document.body
  );
}
