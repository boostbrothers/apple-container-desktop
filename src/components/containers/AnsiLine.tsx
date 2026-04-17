import Anser, { type AnserJsonEntry } from "anser";
import type { CSSProperties } from "react";

interface AnsiLineProps {
  text: string;
}

function entryStyle(entry: AnserJsonEntry): CSSProperties {
  const style: CSSProperties = {};
  let color = entry.fg ? `rgb(${entry.fg})` : undefined;
  let background = entry.bg ? `rgb(${entry.bg})` : undefined;

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

  return style;
}

export function AnsiLine({ text }: AnsiLineProps) {
  let entries: AnserJsonEntry[];
  try {
    entries = Anser.ansiToJson(text, {
      json: true,
      remove_empty: true,
      use_classes: false,
    });
  } catch {
    return <div style={{ minHeight: "1em" }}>{text}</div>;
  }

  if (entries.length === 0) {
    return <div style={{ minHeight: "1em" }}>&nbsp;</div>;
  }

  return (
    <div style={{ minHeight: "1em" }}>
      {entries.map((entry, index) => (
        <span key={index} style={entryStyle(entry)}>
          {entry.content}
        </span>
      ))}
    </div>
  );
}
