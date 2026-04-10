import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useImportDotenvToProfile } from "../../hooks/useEnvStore";

interface DotenvImportProps {
  profileId: string;
}

export function DotenvImport({ profileId }: DotenvImportProps) {
  const importDotenv = useImportDotenvToProfile();

  const handleImport = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Env Files", extensions: ["env", "*"] }],
    });
    if (!selected) return;
    const path = typeof selected === "string" ? selected : selected[0];
    if (!path) return;

    importDotenv.mutate({ profileId, filePath: path });
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 text-xs"
      onClick={handleImport}
      disabled={importDotenv.isPending}
    >
      <FileText className="h-3.5 w-3.5 mr-1" />
      Import .env
    </Button>
  );
}
