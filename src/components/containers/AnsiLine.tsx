import Anser, { type AnserJsonEntry } from "anser";
import { memo, type CSSProperties } from "react";
import { brightenForDarkBg } from "@/lib/ansi-palette";

interface AnsiLineProps {
  text: string;
  highlight?: {
    query: string;
    isActive: boolean;
  };
}

const LINE_STYLE: CSSProperties = { minHeight: "1em" };

function rgbOrUndefined(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return `rgb(${value})`;
}

function entryStyle(entry: AnserJsonEntry): CSSProperties {
  const style: CSSProperties = {};
  let color = rgbOrUndefined(brightenForDarkBg(entry.fg));
  let background = rgbOrUndefined(entry.bg);

  const decorations = entry.decorations ?? [];

  if (decorations.includes("reverse")) {
    [color, background] = [background, color];
  }

  if (color) style.color = color;
  if (background) style.backgroundColor = background;

  if (decorations.includes("bold")) style.fontWeight = 600;
  if (decorations.includes("italic")) style.fontStyle = "italic";
  if (decorations.includes("underline")) style.textDecoration = "underline";
  if (decorations.includes("dim")) style.opacity = 0.6;
  if (decorations.includes("strikethrough")) {
    style.textDecoration = style.textDecoration
      ? `${style.textDecoration} line-through`
      : "line-through";
  }
  // `hidden`: keep layout (visibility), content invisible
  if (decorations.includes("hidden")) style.visibility = "hidden";
  // `blink`: intentionally ignored for accessibility / user comfort

  return style;
}

function renderContent(content: string, highlight: AnsiLineProps["highlight"]) {
  if (!highlight || !highlight.query) return content;
  const query = highlight.query;
  const lowerContent = content.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const parts: Array<string | { match: string }> = [];
  let cursor = 0;
  while (cursor < content.length) {
    const idx = lowerContent.indexOf(lowerQuery, cursor);
    if (idx === -1) {
      parts.push(content.slice(cursor));
      break;
    }
    if (idx > cursor) parts.push(content.slice(cursor, idx));
    parts.push({ match: content.slice(idx, idx + query.length) });
    cursor = idx + query.length;
    if (query.length === 0) break;
  }
  return parts.map((part, i) =>
    typeof part === "string" ? (
      <span key={i}>{part}</span>
    ) : (
      <mark
        key={i}
        className={
          highlight.isActive
            ? "bg-yellow-300 text-black ring-2 ring-yellow-200 rounded-sm"
            : "bg-yellow-400/70 text-black rounded-sm"
        }
      >
        {part.match}
      </mark>
    )
  );
}

function AnsiLineInner({ text, highlight }: AnsiLineProps) {
  let entries: AnserJsonEntry[];
  try {
    entries = Anser.ansiToJson(text, {
      json: true,
      remove_empty: true,
      use_classes: false,
    });
  } catch {
    return <div style={LINE_STYLE}>{text}</div>;
  }

  if (entries.length === 0) {
    return <div style={LINE_STYLE}>&nbsp;</div>;
  }

  return (
    <div style={LINE_STYLE}>
      {entries.map((entry, index) => (
        <span key={index} style={entryStyle(entry)}>
          {renderContent(entry.content, highlight)}
        </span>
      ))}
    </div>
  );
}

export const AnsiLine = memo(AnsiLineInner);
