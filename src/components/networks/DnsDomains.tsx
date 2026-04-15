import { useState } from "react";
import { Globe, Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  useDnsList,
  useDnsCreate,
  useDnsDelete,
  useDnsSetDefault,
} from "../../hooks/useDns";

export function DnsDomains() {
  const { data: dnsList, isLoading, error } = useDnsList();
  const create = useDnsCreate();
  const remove = useDnsDelete();
  const setDefault = useDnsSetDefault();

  const [newDomain, setNewDomain] = useState("");

  const handleCreate = () => {
    const trimmed = newDomain.trim();
    if (!trimmed) return;
    create.mutate(trimmed, {
      onSuccess: () => setNewDomain(""),
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">DNS Domains</h3>
        {dnsList && (
          <span className="text-xs text-muted-foreground">
            {dnsList.domains.length} domain{dnsList.domains.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground">
        Manage DNS domains for container routing. The default domain is used when no domain is specified.
      </p>

      {/* Add domain */}
      <div className="flex items-center gap-2">
        <Input
          placeholder="e.g. dev, test, my-project"
          value={newDomain}
          onChange={(e) => setNewDomain(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          className="h-7 text-xs font-mono flex-1"
        />
        <Button
          size="sm"
          className="h-7 text-xs"
          disabled={!newDomain.trim() || create.isPending}
          onClick={handleCreate}
        >
          {create.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <>
              <Plus className="h-3 w-3 mr-1" /> Add Domain
            </>
          )}
        </Button>
      </div>
      {create.isError && (
        <p className="text-[10px] text-destructive">{String(create.error)}</p>
      )}

      {/* Loading */}
      {isLoading && (
        <p className="text-xs text-muted-foreground">Loading DNS domains...</p>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs text-destructive">
          Failed to load DNS domains: {String(error)}
        </p>
      )}

      {/* Domain list */}
      {dnsList && dnsList.domains.length > 0 && (
        <div className="space-y-1.5">
          {dnsList.domains.map((domain) => {
            const isDefault = domain === dnsList.default_domain;
            return (
              <div
                key={domain}
                className="flex items-center gap-2 rounded-md bg-muted/20 px-3 py-2"
              >
                <input
                  type="radio"
                  name="dns-default-domain"
                  checked={isDefault}
                  onChange={() => {
                    if (!isDefault) setDefault.mutate(domain);
                  }}
                  disabled={setDefault.isPending}
                  className="h-3 w-3 accent-primary"
                />
                <code className="text-xs font-mono flex-1 truncate">
                  {domain}
                </code>
                {isDefault && (
                  <Badge variant="outline" className="text-[9px] shrink-0">
                    Default
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-destructive hover:text-destructive"
                  onClick={() => remove.mutate(domain)}
                  disabled={remove.isPending}
                  title="Delete domain"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
      {dnsList && dnsList.domains.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No DNS domains configured.
        </p>
      )}

      {/* Set-default / delete errors */}
      {setDefault.isError && (
        <p className="text-[10px] text-destructive">
          {String(setDefault.error)}
        </p>
      )}
      {remove.isError && (
        <p className="text-[10px] text-destructive">
          {String(remove.error)}
        </p>
      )}
    </div>
  );
}
