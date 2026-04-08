import { Box, Image, HardDrive, Network, Settings } from "lucide-react";

interface SidebarGuideStepProps {
  onFinish: () => void;
  onSkip: () => void;
}

const sidebarItems = [
  { icon: Box, label: "Containers", desc: "컨테이너 목록 확인 및 관리" },
  { icon: Image, label: "Images", desc: "Docker 이미지 관리" },
  { icon: HardDrive, label: "Volumes", desc: "데이터 볼륨 관리" },
  { icon: Network, label: "Networks", desc: "Docker 네트워크 관리" },
  { icon: Settings, label: "Settings", desc: "VM, 마운트, 네트워크 설정" },
];

export function SidebarGuideStep({ onFinish, onSkip }: SidebarGuideStepProps) {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-foreground">사이드바 둘러보기</h2>
        <p className="text-sm text-muted-foreground">
          왼쪽 사이드바에서 Docker 리소스를 관리할 수 있습니다
        </p>
      </div>
      <div className="w-full max-w-xs space-y-2">
        {sidebarItems.map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-3 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-2.5 text-left"
          >
            <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">{item.label}</div>
              <div className="text-xs text-muted-foreground">{item.desc}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-3 pt-2">
        <button
          onClick={onSkip}
          className="rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          건너뛰기
        </button>
        <button
          onClick={onFinish}
          className="rounded-lg bg-gradient-to-r from-green-500 to-green-600 px-6 py-2 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md"
        >
          시작하기
        </button>
      </div>
    </div>
  );
}
