import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Loader2, Copy, Check } from "lucide-react";
import { api } from "../../lib/tauri";
import type { ColimaInstallCheck } from "../../types";

interface ColimaCheckStepProps {
  onNext: () => void;
  onSkip: () => void;
}

export function ColimaCheckStep({ onNext, onSkip }: ColimaCheckStepProps) {
  const [status, setStatus] = useState<"checking" | "installed" | "not-installed">("checking");
  const [installInfo, setInstallInfo] = useState<ColimaInstallCheck | null>(null);
  const [copied, setCopied] = useState(false);

  const checkInstall = async () => {
    setStatus("checking");
    try {
      const result = await api.checkColimaInstalled();
      setInstallInfo(result);
      setStatus(result.installed ? "installed" : "not-installed");
    } catch {
      setStatus("not-installed");
    }
  };

  useEffect(() => {
    checkInstall();
  }, []);

  const handleCopy = async () => {
    await navigator.clipboard.writeText("brew install colima");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      {status === "checking" && (
        <>
          <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Colima 설치 여부를 확인하고 있습니다...</p>
        </>
      )}

      {status === "installed" && (
        <>
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--status-running-bg)]">
            <CheckCircle2 className="h-8 w-8 text-[var(--status-running-text)]" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">Colima가 설치되어 있습니다</h2>
            {installInfo?.path && (
              <p className="text-xs text-muted-foreground font-mono">{installInfo.path}</p>
            )}
          </div>
        </>
      )}

      {status === "not-installed" && (
        <>
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <XCircle className="h-8 w-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">Colima가 설치되지 않았습니다</h2>
            <p className="text-sm text-muted-foreground">
              아래 명령어로 Colima를 설치해주세요
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-2.5">
            <code className="text-sm font-mono text-foreground">brew install colima</code>
            <button
              onClick={handleCopy}
              className="ml-2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
              title="복사"
            >
              {copied ? <Check className="h-4 w-4 text-[var(--status-running-text)]" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </>
      )}

      <div className="flex gap-3 pt-2">
        <button
          onClick={onSkip}
          className="rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          건너뛰기
        </button>
        {status === "not-installed" ? (
          <button
            onClick={checkInstall}
            className="rounded-lg bg-gradient-to-r from-green-500 to-green-600 px-6 py-2 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md"
          >
            다시 확인
          </button>
        ) : status === "installed" ? (
          <button
            onClick={onNext}
            className="rounded-lg bg-gradient-to-r from-green-500 to-green-600 px-6 py-2 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md"
          >
            다음
          </button>
        ) : null}
      </div>
    </div>
  );
}
