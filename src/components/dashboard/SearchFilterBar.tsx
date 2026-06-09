'use client'

/**
 * SearchFilterBar — text search input + category filter chips + sort select.
 *
 * Used by GrantMatchList to filter and sort grant matches client-side/server-side.
 * Debounces search input by 300ms.
 * All filter chips meet 44px min touch target (WCAG 2.1 AA).
 */

import { useRef } from 'react'
import { Search } from 'lucide-react'
import * as Select from '@radix-ui/react-select'
import { ChevronDown, Check } from 'lucide-react'

export interface FilterOption {
  value: string
  label: string
}

interface SearchFilterBarProps {
  onSearch: (term: string) => void
  onFilter: (type: string) => void
  onSort: (sort: string) => void
  filterOptions: FilterOption[]
  currentFilter: string
  currentSort: string
}

const SORT_OPTIONS = [
  { value: 'score_desc', label: 'Score (High to Low)' },
  { value: 'score_asc', label: 'Score (Low to High)' },
  { value: 'created_desc', label: 'Newest First' },
]

export function SearchFilterBar({
  onSearch,
  onFilter,
  onSort,
  filterOptions,
  currentFilter,
  currentSort,
}: SearchFilterBarProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onSearch(value)
    }, 300)
  }

  return (
    <div className="space-y-3">
      {/* Text search input */}
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
          aria-hidden="true"
        />
        <input
          type="text"
          placeholder="Search grants…"
          aria-label="Search grants"
          onChange={handleSearchChange}
          className="w-full pl-9 pr-4 py-2.5 text-sm font-body border border-gray-200 rounded-md bg-white
            placeholder:text-gray-400 text-gray-900
            focus:outline-none focus:ring-2 focus:ring-[#C9A84C] focus:ring-offset-2 focus:border-transparent"
        />
      </div>

      {/* Filter chips + sort select row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Filter chips */}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
          {filterOptions.map((opt) => {
            const isActive = currentFilter === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onFilter(opt.value)}
                aria-pressed={isActive}
                className={`min-h-[44px] px-4 py-2 rounded-full text-sm font-semibold font-body transition-colors duration-150
                  focus:outline-none focus:ring-2 focus:ring-[#C9A84C] focus:ring-offset-2
                  ${
                    isActive
                      ? 'bg-[#2D5016] text-white'
                      : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                  }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>

        {/* Sort select */}
        <Select.Root value={currentSort} onValueChange={onSort}>
          <Select.Trigger
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-md border border-gray-200
              bg-white text-sm font-body text-gray-700
              focus:outline-none focus:ring-2 focus:ring-[#C9A84C] focus:ring-offset-2
              hover:bg-gray-50 ml-auto"
            aria-label="Sort grants"
          >
            <Select.Value />
            <Select.Icon>
              <ChevronDown className="h-4 w-4 text-gray-400" aria-hidden="true" />
            </Select.Icon>
          </Select.Trigger>

          <Select.Portal>
            <Select.Content
              className="z-50 bg-white rounded-md shadow-lg border border-gray-100 overflow-hidden"
              position="popper"
              sideOffset={4}
            >
              <Select.Viewport className="p-1">
                {SORT_OPTIONS.map((opt) => (
                  <Select.Item
                    key={opt.value}
                    value={opt.value}
                    className="relative flex items-center gap-2 px-3 py-2 text-sm font-body text-gray-700
                      rounded-sm cursor-pointer select-none
                      data-[highlighted]:bg-gray-50 data-[highlighted]:outline-none"
                  >
                    <Select.ItemText>{opt.label}</Select.ItemText>
                    <Select.ItemIndicator className="ml-auto">
                      <Check className="h-4 w-4 text-[#2D5016]" aria-hidden="true" />
                    </Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      </div>
    </div>
  )
}
