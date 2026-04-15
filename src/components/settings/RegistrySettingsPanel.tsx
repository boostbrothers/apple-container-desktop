import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, X, LogIn, LogOut } from "lucide-react";
import { useRegistrySettings, useRegistryLogin, useRegistryLogout } from "@/hooks/useRegistrySettings";

export function RegistrySettingsPanel() {
  const { data: settings, isLoading, error } = useRegistrySettings();
  const loginMutation = useRegistryLogin();
  const logoutMutation = useRegistryLogout();

  const [registry, setRegistry] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = () => {
    if (!registry.trim() || !username.trim() || !password.trim()) return;
    loginMutation.mutate(
      { registry: registry.trim(), username: username.trim(), password },
      {
        onSuccess: () => {
          setRegistry("");
          setUsername("");
          setPassword("");
        },
      }
    );
  };

  const handleLogout = (reg: string) => {
    logoutMutation.mutate(reg);
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Failed to load registry settings.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h2 className="text-lg font-semibold">Registry Settings</h2>

      <div className="space-y-5">
        {/* Default Domain */}
        {settings?.default_domain && (
          <div className="rounded-md bg-muted/20 px-3 py-2">
            <div className="text-[10px] uppercase text-muted-foreground mb-1">
              Default Registry
            </div>
            <div className="text-sm font-mono">{settings.default_domain}</div>
          </div>
        )}

        {/* Authenticated Registries */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Authenticated Registries</label>
          {settings?.registries && settings.registries.length > 0 ? (
            <div className="space-y-1">
              {settings.registries.map((entry, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="glass-list-item flex-1 px-3 py-1.5 text-sm font-mono">
                    {entry.registry}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleLogout(entry.registry)}
                    disabled={logoutMutation.isPending}
                    title="Logout"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No registries authenticated.</p>
          )}
        </div>

        {/* Login to Registry */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Login to Registry</label>
          <Input
            placeholder="registry (e.g. ghcr.io)"
            value={registry}
            onChange={(e) => setRegistry(e.target.value)}
            disabled={loginMutation.isPending}
          />
          <Input
            placeholder="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={loginMutation.isPending}
          />
          <Input
            type="password"
            placeholder="password / token"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loginMutation.isPending}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          />
          <Button
            onClick={handleLogin}
            disabled={!registry.trim() || !username.trim() || !password.trim() || loginMutation.isPending}
            className="w-full"
          >
            {loginMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Logging in...
              </>
            ) : (
              <>
                <LogIn className="mr-2 h-4 w-4" />
                Login
              </>
            )}
          </Button>

          {loginMutation.isError && (
            <p className="text-center text-xs text-destructive">
              {loginMutation.error?.message ?? "Login failed"}
            </p>
          )}

          {loginMutation.isSuccess && (
            <p className="text-center text-xs text-green-600">
              Logged in successfully
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
