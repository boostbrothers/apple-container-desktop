import appIcon from "../../assets/app-icon.png";

interface WelcomeStepProps {
  onNext: () => void;
  onSkip: () => void;
}

export function WelcomeStep({ onNext, onSkip }: WelcomeStepProps) {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <img src={appIcon} alt="Apple Container Desktop" className="h-20 w-20 rounded-2xl shadow-lg" />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">
          Apple Container Desktop에 오신 것을 환영합니다
        </h1>
        <p className="text-sm text-muted-foreground">
          macOS를 위한 네이티브 컨테이너 관리 앱
        </p>
      </div>
      <div className="flex gap-3 pt-2">
        <button
          onClick={onSkip}
          className="rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          건너뛰기
        </button>
        <button
          onClick={onNext}
          className="rounded-lg bg-gradient-to-r from-green-500 to-green-600 px-6 py-2 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md"
        >
          다음
        </button>
      </div>
    </div>
  );
}
