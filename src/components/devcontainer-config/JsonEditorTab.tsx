import { useState, useEffect, useCallback } from "react";
import type { DevcontainerValidationError } from "../../types";
import { useValidateDevcontainerConfig } from "../../hooks/useProjectConfig";

interface JsonEditorTabProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  onParseError: (hasError: boolean) => void;
}

export function JsonEditorTab({ config, onChange, onParseError }: JsonEditorTabProps) {
  const [text, setText] = useState(() => JSON.stringify(config, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<DevcontainerValidationError[]>([]);
  const validate = useValidateDevcontainerConfig();

  // Sync external config changes to text
  useEffect(() => {
    setText(JSON.stringify(config, null, 2));
    setParseError(null);
  }, [config]);

  const debouncedValidate = useCallback(
    (() => {
      let timer: ReturnType<typeof setTimeout>;
      return (parsed: Record<string, unknown>) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          validate.mutate(parsed, {
            onSuccess: (errors) => setValidationErrors(errors),
          });
        }, 500);
      };
    })(),
    [validate],
  );

  const handleChange = (value: string) => {
    setText(value);
    try {
      const parsed = JSON.parse(value);
      setParseError(null);
      onParseError(false);
      onChange(parsed);
      debouncedValidate(parsed);
    } catch {
      setParseError("Invalid JSON");
      onParseError(true);
    }
  };

  return (
    <div className="space-y-2 h-full flex flex-col">
      <textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        className="flex-1 min-h-[400px] w-full resize-none rounded-md border border-[var(--glass-border)] bg-black/20 p-3 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        spellCheck={false}
      />

      {parseError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
          <p className="text-xs text-destructive">{parseError}</p>
        </div>
      )}

      {!parseError && validationErrors.length > 0 && (
        <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 px-3 py-2 max-h-32 overflow-y-auto">
          <p className="text-[10px] uppercase text-yellow-500 font-medium mb-1">
            Validation Warnings ({validationErrors.length})
          </p>
          {validationErrors.map((err, i) => (
            <p key={i} className="text-xs text-yellow-400">
              <span className="font-mono">{err.path || "/"}</span>: {err.message}
            </p>
          ))}
        </div>
      )}

      {!parseError && validationErrors.length === 0 && (
        <p className="text-xs text-green-400">JSON is valid.</p>
      )}
    </div>
  );
}
