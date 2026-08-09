import { useEffect, useRef, useState } from "react";

// A label that quietly truncates until it can't be read, then slides back and
// forth so the whole thing is legible. Only animates when the text actually
// overflows, and only while active/hovered — a constantly moving sidebar would
// be exhausting.
export default function Marquee({
  children,
  active,
  className = "",
}: {
  children: React.ReactNode;
  active?: boolean; // e.g. the row is selected or hovered
  className?: string;
}) {
  const outer = useRef<HTMLSpanElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);

  useEffect(() => {
    const measure = () => {
      const o = outer.current;
      const i = inner.current;
      if (!o || !i) return;
      setOverflow(Math.max(0, i.scrollWidth - o.clientWidth));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (outer.current) ro.observe(outer.current);
    return () => ro.disconnect();
  }, [children]);

  const running = active && overflow > 2;

  return (
    <span ref={outer} className={`relative block overflow-hidden whitespace-nowrap ${className}`}>
      <span
        ref={inner}
        className={running ? "cc-marquee inline-block" : "inline-block max-w-full truncate align-bottom"}
        style={running ? ({ "--marquee-dx": `-${overflow}px` } as React.CSSProperties) : undefined}
      >
        {children}
      </span>
    </span>
  );
}
