import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface LogToolbarProps {
  filter: string;
  onFilterChange: (value: string) => void;
  showingCount: number;
  totalCount: number;
  searchOpen: boolean;
  onSearchToggle: () => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  matchCount: number;
  activeIndex: number;
  onSearchPrev: () => void;
  onSearchNext: () => void;
  onSearchClose: () => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}

export function LogToolbar({
  filter,
  onFilterChange,
  showingCount,
  totalCount,
  searchOpen,
  onSearchToggle,
  searchQuery,
  onSearchQueryChange,
  matchCount,
  activeIndex,
  onSearchPrev,
  onSearchNext,
  onSearchClose,
  searchInputRef,
}: LogToolbarProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-0 max-w-sm">
          <span className="text-xs text-zinc-400 shrink-0">Filter:</span>
          <Input
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            placeholder="substring..."
            className="h-7 text-xs"
          />
          {filter && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 shrink-0"
              onClick={() => onFilterChange("")}
              aria-label="Clear filter"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <span className="text-xs text-zinc-500 tabular-nums">
          {showingCount.toLocaleString()} / {totalCount.toLocaleString()}
        </span>
        <Button
          variant={searchOpen ? "secondary" : "ghost"}
          size="sm"
          onClick={onSearchToggle}
          aria-label="Search (Cmd+F)"
          title="Search (Cmd+F)"
        >
          <Search className="h-3.5 w-3.5" />
        </Button>
      </div>

      {searchOpen && (
        <div className="flex items-center gap-1.5">
          <Input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder="search..."
            className="h-7 text-xs flex-1 max-w-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (e.shiftKey) onSearchPrev();
                else onSearchNext();
              } else if (e.key === "Escape") {
                e.preventDefault();
                onSearchClose();
              }
            }}
            autoFocus
          />
          <span className="text-xs text-zinc-500 tabular-nums shrink-0">
            {matchCount === 0 ? "0 / 0" : `${activeIndex + 1} / ${matchCount}`}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onSearchPrev}
            disabled={matchCount === 0}
            aria-label="Previous match"
          >
            ↑
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onSearchNext}
            disabled={matchCount === 0}
            aria-label="Next match"
          >
            ↓
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onSearchClose}
            aria-label="Close search"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
