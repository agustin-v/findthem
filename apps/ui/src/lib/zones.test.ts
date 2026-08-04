import {
  getDecayLevel,
  getZoneColor,
  zonesToGeoJSON,
  ZONE_STATUS_CYCLE,
  ZONE_COLORS,
  type Zone,
} from './zones'

describe('getDecayLevel', () => {
  it('returns fresh for < 1 hour', () => {
    expect(getDecayLevel(Date.now() - 0.5 * 3_600_000)).toBe('fresh')
  })

  it('returns aging for 1-2 hours', () => {
    expect(getDecayLevel(Date.now() - 1.5 * 3_600_000)).toBe('aging')
  })

  it('returns stale for 2-4 hours', () => {
    expect(getDecayLevel(Date.now() - 3 * 3_600_000)).toBe('stale')
  })

  it('returns expired for 4+ hours', () => {
    expect(getDecayLevel(Date.now() - 5 * 3_600_000)).toBe('expired')
  })
})

describe('getZoneColor', () => {
  it('returns grey for not_assigned', () => {
    expect(getZoneColor({ h3Index: 'a', status: 'not_assigned' })).toBe(ZONE_COLORS.not_assigned)
  })

  it('returns blue for assigned', () => {
    expect(getZoneColor({ h3Index: 'a', status: 'assigned' })).toBe(ZONE_COLORS.assigned)
  })

  it('returns purple for in_progress', () => {
    expect(getZoneColor({ h3Index: 'a', status: 'in_progress' })).toBe(ZONE_COLORS.in_progress)
  })

  it('returns decay color for searched zones', () => {
    const zone: Zone = { h3Index: 'a', status: 'searched', searchedAt: Date.now() - 0.5 * 3_600_000 }
    expect(getZoneColor(zone)).toBe(ZONE_COLORS.fresh)
  })
})

describe('zonesToGeoJSON', () => {
  it('produces valid FeatureCollection', () => {
    const zones: Zone[] = [
      { h3Index: '891f1d48177ffff', status: 'not_assigned' },
      { h3Index: '891f1d48173ffff', status: 'assigned' },
    ]
    const geojson = zonesToGeoJSON(zones)

    expect(geojson.type).toBe('FeatureCollection')
    expect(geojson.features).toHaveLength(2)
  })

  it('produces closed polygon rings', () => {
    const zones: Zone[] = [{ h3Index: '891f1d48177ffff', status: 'not_assigned' }]
    const geojson = zonesToGeoJSON(zones)
    const ring = geojson.features[0].geometry.coordinates[0]
    const first = ring[0]
    const last = ring[ring.length - 1]
    expect(first[0]).toBe(last[0])
    expect(first[1]).toBe(last[1])
  })

  it('skips a zone with a malformed h3Index instead of throwing', () => {
    const zones: Zone[] = [
      { h3Index: 'ffffffffffffffff', status: 'not_assigned' },
      { h3Index: '891f1d48177ffff', status: 'assigned' },
    ]

    const geojson = zonesToGeoJSON(zones)

    expect(geojson.features).toHaveLength(1)
    expect(geojson.features[0].properties?.h3Index).toBe('891f1d48177ffff')
  })
})

describe('ZONE_STATUS_CYCLE', () => {
  it('cycles through all statuses', () => {
    expect(ZONE_STATUS_CYCLE.not_assigned).toBe('assigned')
    expect(ZONE_STATUS_CYCLE.assigned).toBe('in_progress')
    expect(ZONE_STATUS_CYCLE.in_progress).toBe('searched')
    expect(ZONE_STATUS_CYCLE.searched).toBe('not_assigned')
  })
})
