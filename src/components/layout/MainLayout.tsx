import { useState } from "react";
import { Sidebar } from "./Sidebar";
import type { Page, ComposeFilter } from "./Sidebar";
import { ContainerList } from "../containers/ContainerList";
import { ImageList } from "../images/ImageList";
import { VolumeList } from "../volumes/VolumeList";
import { NetworkList } from "../networks/NetworkList";
import { ResourceSettingsPanel } from "../settings/ResourceSettingsPanel";
import { RegistrySettingsPanel } from "../settings/RegistrySettingsPanel";
import { UpdatePanel } from "../settings/UpdatePanel";
import { AppearanceSettings } from "../settings/AppearanceSettings";
import { TerminalSettings } from "../settings/TerminalSettings";
import { ContainerDomainsSettings } from "../settings/ContainerDomainsSettings";
import { EnvironmentPage } from "../environment/EnvironmentPage";

export function MainLayout() {
  const [activePage, setActivePage] = useState<Page>("containers");
  const [composeFilter, setComposeFilter] = useState<ComposeFilter>(null);

  return (
    <div className="relative z-10 flex h-screen">
      <Sidebar
        activePage={activePage}
        onPageChange={setActivePage}
        composeFilter={composeFilter}
        onComposeFilter={setComposeFilter}
      />
      <main className="flex-1 min-w-0 overflow-auto p-4">
        {activePage === "containers" && (
          <ContainerList composeFilter={composeFilter} />
        )}
        {activePage === "images" && <ImageList />}
        {activePage === "volumes" && <VolumeList />}
        {activePage === "networks" && <NetworkList />}
        {activePage === "environment" && <EnvironmentPage />}
        {activePage === "settings/resources" && <ResourceSettingsPanel />}
        {activePage === "settings/registry" && <RegistrySettingsPanel />}
        {activePage === "settings/domains" && <ContainerDomainsSettings />}
        {activePage === "settings/terminal" && <TerminalSettings />}
        {activePage === "settings/update" && <UpdatePanel />}
        {activePage === "settings/appearance" && <AppearanceSettings />}
      </main>
    </div>
  );
}
