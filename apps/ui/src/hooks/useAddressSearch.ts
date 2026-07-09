import { useEffect, useRef, useState } from 'react'
import { fuzzySearch, type SearchSuggestion } from '@/lib/tomtom'

export function useAddressSearch(query: string) {
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!query.trim() || query.length < 3) {
      setSuggestions([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    const timer = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      const results = await fuzzySearch(query, controller.signal)
      if (!controller.signal.aborted) {
        setSuggestions(results)
        setIsSearching(false)
      }
    }, 300)

    return () => {
      clearTimeout(timer)
    }
  }, [query])

  return { suggestions, isSearching }
}
