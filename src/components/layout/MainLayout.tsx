import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { ContainerList } from "../containers/ContainerList";
import { ProjectList } from "../projects/ProjectList";
import { ImageList } from "../images/ImageList";
import { VolumeList } from "../volumes/VolumeList";
import { NetworkList } from "../networks/NetworkList";
import { VmSettings } from "../settings/VmSettings";
import { MountSettings } from "../settings/MountSettings";
import { NetworkSettingsPanel } from "../settings/NetworkSettingsPanel";
import { DockerSettingsPanel } from "../settings/DockerSettingsPanel";
import { UpdatePanel } from "../settings/UpdatePanel";
import { AppearanceSettings } from "../settings/AppearanceSettings";
import { TerminalSettings } from "../settings/TerminalSettings";

type Page = "containers" | "projects" | "images" | "volumes" | "networks" | "settings";
type SettingsTab = "vm" | "mounts" | "network" | "docker" | "terminal" | "update" | "appearance";

export function MainLayout() {
  const [activePage, setActivePage] = useState<Page>("containers");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("vm");

  return (
    <div className="relative z-10 flex h-screen">
      <Sidebar activePage={activePage} onPageChange={setActivePage} />
      <main className="flex-1 overflow-auto p-4">
        {activePage === "containers" && <ContainerList />}
        {activePage === "projects" && <ProjectList />}
        {activePage === "images" && <ImageList />}
        {activePage === "volumes" && <VolumeList />}
        {activePage === "networks" && <NetworkList />}
        {activePage === "settings" && (
          <div className="space-y-4">
            <div className="mx-auto max-w-lg flex gap-1 rounded-xl glass-panel p-1">
              <button
                onClick={() => setSettingsTab("vm")}
                className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                  settingsTab === "vm"
                    ? "bg-[var(--glass-bg-active)] text-foreground shadow-sm border border-[var(--glass-border-strong)]"
                    : "text-muted-foreground hover:text-foreground border border-transparent"
                }`}
              >
                VM
              </button>
              <button
                onClick={() => setSettingsTab("mounts")}
                className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                  settingsTab === "mounts"
                    ? "bg-[var(--glass-bg-active)] text-foreground shadow-sm border border-[var(--glass-border-strong)]"
                    : "text-muted-foreground hover:text-foreground border border-transparent"
                }`}
              >
                Mounts
              </button>
              <button
                onClick={() => setSettingsTab("network")}
                className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                  settingsTab === "network"
                    ? "bg-[var(--glass-bg-active)] text-foreground shadow-sm border border-[var(--glass-border-strong)]"
                    : "text-muted-foreground hover:text-foreground border border-transparent"
                }`}
              >
                Network
              </button>
              <button
                onClick={() => setSettingsTab("docker")}
                className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                  settingsTab === "docker"
                    ? "bg-[var(--glass-bg-active)] text-foreground shadow-sm border border-[var(--glass-border-strong)]"
                    : "text-muted-foreground hover:text-foreground border border-transparent"
                }`}
              >
                Docker
              </button>
              <button
                onClick={() => setSettingsTab("terminal")}
                className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                  settingsTab === "terminal"
                    ? "bg-[var(--glass-bg-active)] text-foreground shadow-sm border border-[var(--glass-border-strong)]"
                    : "text-muted-foreground hover:text-foreground border border-transparent"
                }`}
              >
                Terminal
              </button>
              <button
                onClick={() => setSettingsTab("update")}
                className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                  settingsTab === "update"
                    ? "bg-[var(--glass-bg-active)] text-foreground shadow-sm border border-[var(--glass-border-strong)]"
                    : "text-muted-foreground hover:text-foreground border border-transparent"
                }`}
              >
                Update
              </button>
              <button
                onClick={() => setSettingsTab("appearance")}
                className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                  settingsTab === "appearance"
                    ? "bg-[var(--glass-bg-active)] text-foreground shadow-sm border border-[var(--glass-border-strong)]"
                    : "text-muted-foreground hover:text-foreground border border-transparent"
                }`}
              >
                Appearance
              </button>
            </div>
            {settingsTab === "vm" && <VmSettings />}
            {settingsTab === "mounts" && <MountSettings />}
            {settingsTab === "network" && <NetworkSettingsPanel />}
            {settingsTab === "docker" && <DockerSettingsPanel />}
            {settingsTab === "terminal" && <TerminalSettings />}
            {settingsTab === "update" && <UpdatePanel />}
            {settingsTab === "appearance" && <AppearanceSettings />}
          </div>
        )}
      </main>
    </div>
  );
}
