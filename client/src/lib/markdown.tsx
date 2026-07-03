import React from "react";

export type EmojiMap = Record<string, string>; // name -> image url

// Minimal, safe Discord-flavored markdown (no dangerouslySetInnerHTML).
// Block level: ```fenced code``` (with light syntax highlight + lang label),
// > blockquotes, # headers, - / 1. lists. Inline: `code`, **bold**, *italic*,
// __underline__, ~~strike~~, ||spoiler||, autolinks, :custom_emoji:.
export function renderMarkdown(text: string, customEmojis?: EmojiMap): React.ReactNode {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    const fence = part.match(/^```(\w+)?\n?([\s\S]*?)```$/);
    if (fence) {
      const lang = fence[1];
      const body = fence[2].replace(/\n$/, "");
      return (
        <pre
          key={i}
          className="relative my-1 overflow-x-auto rounded bg-discord-deep p-2 pt-5 font-mono text-sm leading-snug text-discord-text"
        >
          {lang && (
            <span className="absolute right-2 top-1 text-[10px] uppercase tracking-wide text-discord-faint">{lang}</span>
          )}
          <code>{highlightCode(body)}</code>
        </pre>
      );
    }
    return <React.Fragment key={i}>{renderBlocks(part, customEmojis)}</React.Fragment>;
  });
}

// Group plain text into block elements line-by-line.
function renderBlocks(text: string, customEmojis?: EmojiMap): React.ReactNode[] {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Blockquote: consecutive "> " lines.
    if (/^\s*>\s?/.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoted.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      out.push(
        <blockquote key={key++} className="my-0.5 border-l-4 border-discord-faint/60 pl-2 text-discord-text">
          {quoted.map((q, j) => (
            <div key={j}>{renderInline(q, customEmojis)}</div>
          ))}
        </blockquote>
      );
      continue;
    }

    // Headers: #, ##, ###
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const size = h[1].length === 1 ? "text-xl" : h[1].length === 2 ? "text-lg" : "text-base";
      out.push(
        <div key={key++} className={`mt-1 font-bold text-white ${size}`}>
          {renderInline(h[2], customEmojis)}
        </div>
      );
      i++;
      continue;
    }

    // Lists: consecutive "- ", "* ", or "1." lines.
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const items: { ordered: boolean; text: string }[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        const ordered = /^\s*\d+\.\s+/.test(lines[i]);
        items.push({ ordered, text: lines[i].replace(/^\s*([-*]|\d+\.)\s+/, "") });
        i++;
      }
      const ordered = items[0].ordered;
      const Tag = ordered ? "ol" : "ul";
      out.push(
        <Tag key={key++} className={`my-0.5 ml-5 ${ordered ? "list-decimal" : "list-disc"}`}>
          {items.map((it, j) => (
            <li key={j}>{renderInline(it.text, customEmojis)}</li>
          ))}
        </Tag>
      );
      continue;
    }

    // Plain line (preserve blank lines as spacing).
    out.push(<div key={key++}>{line ? renderInline(line, customEmojis) : " "}</div>);
    i++;
  }
  return out;
}

function renderInline(text: string, customEmojis?: EmojiMap): React.ReactNode[] {
  const pattern =
    /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*]+\*)|(~~[^~]+~~)|(\|\|[^|]+\|\|)|(https?:\/\/[^\s]+)|(:[a-z0-9_]+:)/g;
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
    else if (tok.startsWith(":")) {
      const url = customEmojis?.[tok.slice(1, -1)];
      out.push(
        url ? (
          <img key={key} src={url} alt={tok} title={tok} className="inline-block h-5 w-5 -translate-y-0.5 object-contain align-middle" />
        ) : (
          tok
        )
      );
    }
    key++;
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// Lightweight, language-agnostic highlighter: comments, strings, numbers and
// common keywords. Not a full parser — just enough color to read code.
const KEYWORDS =
  /\b(?:const|let|var|function|return|if|else|for|while|switch|case|break|continue|class|extends|new|import|export|from|default|async|await|try|catch|finally|throw|typeof|instanceof|this|super|public|private|protected|static|void|true|false|null|undefined|none|def|elif|lambda|print|require|module|func|struct|enum|interface|type|fn|mut|use|impl|pub|package|int|float|double|string|bool|boolean)\b/;
const TOKENS = new RegExp(
  `(\\/\\/[^\\n]*|#[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)|("(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|\`(?:\\\\.|[^\`\\\\])*\`)|(\\b\\d[\\d._]*\\b)|(${KEYWORDS.source})`,
  "g"
);

function highlightCode(src: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = TOKENS.exec(src))) {
    if (m.index > last) out.push(src.slice(last, m.index));
    const tok = m[0];
    const cls = m[1]
      ? "text-discord-faint italic" // comment
      : m[2]
      ? "text-discord-green" // string
      : m[3]
      ? "text-[#e0a363]" // number
      : "text-discord-link"; // keyword
    out.push(<span key={key++} className={cls}>{tok}</span>);
    last = m.index + tok.length;
  }
  if (last < src.length) out.push(src.slice(last));
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
