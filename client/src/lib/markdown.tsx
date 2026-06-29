import React from "react";

// Minimal, safe Discord-flavored markdown renderer (no dangerouslySetInnerHTML).
// Supports: ```code blocks```, `inline code`, **bold**, *italic*, __underline__,
// ~~strike~~, ||spoiler||, and autolinks. Extend as needed.
export function renderMarkdown(text: string): React.ReactNode {
  const blocks = text.split(/(```[\s\S]*?```)/g);
  return blocks.map((block, i) => {
    const code = block.match(/^```(?:\w+\n)?([\s\S]*?)```$/);
    if (code) {
      return (
        <pre
          key={i}
          className="my-1 overflow-x-auto rounded bg-discord-deep p-2 font-mono text-sm text-discord-text"
        >
          <code>{code[1].replace(/\n$/, "")}</code>
        </pre>
      );
    }
    return <span key={i}>{renderInline(block)}</span>;
  });
}

function renderInline(text: string): React.ReactNode[] {
  // Token order matters: longer delimiters first.
  const pattern =
    /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*]+\*)|(~~[^~]+~~)|(\|\|[^|]+\|\|)|(https?:\/\/[^\s]+)/g;
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;

  while ((m = pattern.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("`")) out.push(<code key={key} className="rounded bg-discord-deep px-1 py-0.5 font-mono text-sm">{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("**")) out.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("__")) out.push(<u key={key}>{tok.slice(2, -2)}</u>);
    else if (tok.startsWith("~~")) out.push(<s key={key}>{tok.slice(2, -2)}</s>);
    else if (tok.startsWith("||")) out.push(<Spoiler key={key}>{tok.slice(2, -2)}</Spoiler>);
    else if (tok.startsWith("*")) out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    else if (tok.startsWith("http")) out.push(<a key={key} href={tok} target="_blank" rel="noreferrer" className="text-discord-link hover:underline">{tok}</a>);
    key++;
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Spoiler({ children }: { children: React.ReactNode }) {
  const [revealed, setRevealed] = React.useState(false);
  return (
    <span
      onClick={() => setRevealed(true)}
      className={
        revealed
          ? "rounded bg-black/30 px-0.5"
          : "cursor-pointer rounded bg-discord-deep px-0.5 text-transparent"
      }
    >
      {children}
    </span>
  );
}
