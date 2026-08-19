import { useCallback, useEffect, useRef, useState } from 'react'
import { MapPin } from 'lucide-react'
import maplibregl from 'maplibre-gl'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { MapView } from '@/components/shared/MapView'
import { useAddressSearch } from '@/hooks/useAddressSearch'
import { hasApiKey, getMapStyleUrl, reverseGeocode } from '@/lib/tomtom'

export interface LocationValue {
  address: string
  lat: number
  lng: number
}

interface LocationPickerProps {
  value: LocationValue | null
  onChange: (value: LocationValue) => void
  /** Fired on every keystroke, before a suggestion is picked — keeps the
   *  address text in sync with the form even though coordinates aren't
   *  known yet (only a selected suggestion or dragged marker sets those). */
  onInputChange?: (address: string) => void
  placeholder?: string
  error?: string
}

export function LocationPicker({
  value,
  onChange,
  onInputChange,
  placeholder,
  error,
}: LocationPickerProps) {
  const { t } = useTranslation('search')
  const [inputValue, setInputValue] = useState(value?.address ?? '')
  const [showDropdown, setShowDropdown] = useState(false)
  const { suggestions, isSearching } = useAddressSearch(inputValue)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markerRef = useRef<maplibregl.Marker | null>(null)

  // Sync external value changes into input
  useEffect(() => {
    if (value?.address && value.address !== inputValue) {
      setInputValue(value.address)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.address])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleSelectSuggestion = useCallback(
    (suggestion: { address: string; lat: number; lng: number }) => {
      setInputValue(suggestion.address)
      setShowDropdown(false)
      onChange(suggestion)

      if (mapRef.current) {
        mapRef.current.flyTo({ center: [suggestion.lng, suggestion.lat], zoom: 15 })
      }
      if (markerRef.current) {
        markerRef.current.setLngLat([suggestion.lng, suggestion.lat])
      }
    },
    [onChange],
  )

  const handleMapReady = useCallback(
    (map: maplibregl.Map) => {
      mapRef.current = map

      const lngLat: [number, number] = value
        ? [value.lng, value.lat]
        : [12.4964, 41.9028]

      const marker = new maplibregl.Marker({ color: '#E4571B', draggable: true })
        .setLngLat(lngLat)
        .addTo(map)

      markerRef.current = marker

      marker.on('dragend', async () => {
        const pos = marker.getLngLat()
        const address = await reverseGeocode(pos.lat, pos.lng)
        if (address) {
          setInputValue(address)
          onChange({ address, lat: pos.lat, lng: pos.lng })
        } else {
          onChange({ address: `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`, lat: pos.lat, lng: pos.lng })
        }
      })
    },
    [value, onChange],
  )

  // Graceful degradation: no API key → plain input
  if (!hasApiKey()) {
    return (
      <div className="flex flex-col gap-1.5">
        <Input
          className="h-11"
          placeholder={placeholder}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value)
            onChange({ address: e.target.value, lat: 0, lng: 0 })
          }}
        />
        {error && (
          <p className="mt-0.5 text-[13px] text-destructive">{error}</p>
        )}
      </div>
    )
  }

  return (
    <div ref={wrapperRef} className="flex flex-col gap-2">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-11 pl-9"
          placeholder={placeholder ?? t('map.searchPlaceholder')}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value)
            setShowDropdown(true)
            onInputChange?.(e.target.value)
          }}
          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
        />
        {showDropdown && suggestions.length > 0 && (
          <ul className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
            {suggestions.map((s, i) => (
              <li key={i}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                  onClick={() => handleSelectSuggestion(s)}
                >
                  {s.address}
                </button>
              </li>
            ))}
          </ul>
        )}
        {isSearching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          </div>
        )}
      </div>

      {error && (
        <p className="text-[13px] text-destructive">{error}</p>
      )}

      <MapView
        styleUrl={getMapStyleUrl()}
        center={value ? [value.lng, value.lat] : undefined}
        zoom={value ? 15 : 12}
        className="h-[200px] w-full overflow-hidden rounded-md border"
        onMapReady={handleMapReady}
      />

      {value && value.lat !== 0 && value.lng !== 0 && (
        <p className="text-[12px] text-muted-foreground">
          {t('map.coordinates')}: {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
        </p>
      )}
    </div>
  )
}
