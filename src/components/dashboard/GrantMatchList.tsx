'use client'

/**
 * GrantMatchList — paginated, sortable, filterable list of GrantMatchCards.
 *
 * - Filter chips and sort select trigger server-side re-fetch via /api/dashboard/grants
 * - Text search is client-side only (filters current page results in-memory per UI-SPEC)
 * - Pagination: 10 items/page, simple prev/next buttons
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { SearchFilterBar, FilterOption } from './SearchFilterBar'
import { GrantMatchCard, GrantMatch } from './GrantMatchCard'
import { Button } from '@/components/ui/button'

const FILTER_OPTIONS: FilterOption[] = [
  { value: 'all', label: 'All' },
  { value: 'grants', label: 'Grants' },
  { value: 'SBIR', label: 'SBIR' },
  { value: 'state', label: 'State' },
  { value: 'federal', label: 'Federal' },
  { value: 'private', label: 'Private' },
]

interface GrantMatchListProps {
  initialMatches: GrantMatch[]
  initialTotal: number
  tier: string
}

export function GrantMatchList({ initialMatches, initialTotal, tier: _tier }: GrantMatchListProps) {
  const [matches, setMatches] = useState<GrantMatch[]>(initialMatches)
  const [total, setTotal] = useState(initialTotal)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [sortOrder, setSortOrder] = useState('score_desc')

  // Refs so callbacks always read current filter/sort without stale closure (CR-05)
  const filterTypeRef = useRef(filterType)
  const sortOrderRef = useRef(sortOrder)

  useEffect(() => { filterTypeRef.current = filterType }, [filterType])
  useEffect(() => { sortOrderRef.current = sortOrder }, [sortOrder])

  const PER_PAGE = 10

  async function fetchMatches(nextPage: number, type: string, sort: string) {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        sort,
        ...(type !== 'all' ? { type } : {}),
      })
      const res = await fetch(`/api/dashboard/grants?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load grant matches')
      const data = await res.json()
      setMatches(data.matches ?? [])
      setTotal(data.total_count ?? 0)
      setPage(nextPage)
    } catch {
      setError('Unable to load grant matches. Please refresh the page or try again in a moment.')
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = useCallback((term: string) => {
    setSearchTerm(term)
  }, [])

  const handleFilter = useCallback((type: string) => {
    setFilterType(type)
    fetchMatches(0, type, sortOrderRef.current)
  }, []) // sortOrderRef.current is always up-to-date — no stale closure (CR-05)

  const handleSort = useCallback((sort: string) => {
    setSortOrder(sort)
    fetchMatches(0, filterTypeRef.current, sort)
  }, []) // filterTypeRef.current is always up-to-date — no stale closure (CR-05)

  // Client-side search filter on current page results
  const visibleMatches = searchTerm
    ? matches.filter((m) => {
        const term = searchTerm.toLowerCase()
        const nameMatch = m.grants?.name?.toLowerCase().includes(term) ?? false
        const descMatch = m.grants?.description?.toLowerCase().includes(term) ?? false
        return nameMatch || descMatch
      })
    : matches

  const totalPages = Math.ceil(total / PER_PAGE)
  const showingFrom = total === 0 ? 0 : page * PER_PAGE + 1
  const showingTo = Math.min(page * PER_PAGE + PER_PAGE, total)

  return (
    <div className="space-y-6">
      <SearchFilterBar
        onSearch={handleSearch}
        onFilter={handleFilter}
        onSort={handleSort}
        filterOptions={FILTER_OPTIONS}
        currentFilter={filterType}
        currentSort={sortOrder}
      />

      {/* Error state */}
      {error && (
        <div role="alert" className="rounded-md bg-red-50 border border-red-200 p-4 text-sm font-body text-red-700">
          {error}
        </div>
      )}

      {/* Loading overlay indicator */}
      {loading && (
        <div role="status" className="text-sm font-body text-gray-500 py-2">
          Loading grant matches…
        </div>
      )}

      {/* Empty state */}
      {!loading && visibleMatches.length === 0 && (
        <div className="rounded-lg border border-gray-100 bg-white p-10 text-center space-y-2">
          <h3 className="text-[20px] font-semibold font-heading text-gray-900">
            No Grant Matches Yet
          </h3>
          <p className="text-sm font-body text-gray-500 max-w-md mx-auto">
            Our agents are scanning active grants and will surface matches based on your business
            profile.
          </p>
        </div>
      )}

      {/* Match cards */}
      {!loading && visibleMatches.length > 0 && (
        <ul className="space-y-4" aria-label="Grant matches">
          {visibleMatches.map((match) => (
            <li key={match.id}>
              <GrantMatchCard match={match} />
            </li>
          ))}
        </ul>
      )}

      {/* Pagination */}
      {total > PER_PAGE && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm font-body text-gray-500">
            Showing {showingFrom}–{showingTo} of {total} matches
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page === 0 || loading}
              onClick={() => fetchMatches(page - 1, filterType, sortOrder)}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= totalPages - 1 || loading}
              onClick={() => fetchMatches(page + 1, filterType, sortOrder)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
