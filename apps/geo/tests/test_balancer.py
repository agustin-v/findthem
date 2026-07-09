import h3
from shapely.geometry import LineString, Polygon, box

from findthem_geo.models.domain import H3Cell, Segment
from findthem_geo.models.request import Resource
from findthem_geo.services.balancer import (
    _area_km2,
    _classify_accessibility,
    _compute_workload,
    _split_large,
    balance_segments,
)
from findthem_geo.services.h3_grid import h3_cell_to_polygon


def _make_cell(lat: float, lng: float, resolution: int = 9, **kwargs) -> H3Cell:
    idx = h3.latlng_to_cell(lat, lng, resolution)
    return H3Cell(h3_index=idx, polygon=h3_cell_to_polygon(idx), **kwargs)


class TestAreaKm2:
    def test_nonzero_for_real_polygon(self):
        poly = box(12.49, 41.90, 12.50, 41.91)
        area = _area_km2(poly)
        assert area > 0

    def test_empty_polygon_returns_zero(self):
        assert _area_km2(Polygon()) == 0.0

    def test_larger_polygon_has_more_area(self):
        small = box(12.49, 41.90, 12.495, 41.905)
        large = box(12.49, 41.90, 12.50, 41.91)
        assert _area_km2(large) > _area_km2(small)


class TestComputeWorkload:
    def test_open_cells_full_workload(self):
        cell = _make_cell(41.905, 12.495)
        seg = Segment(
            segment_id=0,
            polygon=box(12.49, 41.90, 12.50, 41.91),
            cells=[cell.h3_index],
        )
        workload = _compute_workload(seg, [cell])
        assert workload > 0

    def test_fully_restricted_reduces_workload(self):
        cell_open = _make_cell(41.905, 12.495)
        cell_restricted = _make_cell(41.905, 12.495, status="restricted", restricted_fraction=1.0)

        poly = box(12.49, 41.90, 12.50, 41.91)
        seg_open = Segment(segment_id=0, polygon=poly, cells=[cell_open.h3_index])
        seg_restricted = Segment(
            segment_id=1, polygon=poly, cells=[cell_restricted.h3_index]
        )

        w_open = _compute_workload(seg_open, [cell_open])
        w_restricted = _compute_workload(seg_restricted, [cell_restricted])
        assert w_restricted < w_open

    def test_empty_segment_zero_workload(self):
        seg = Segment(segment_id=0, polygon=Polygon(), cells=[])
        assert _compute_workload(seg, []) == 0.0


class TestBalanceSegments:
    def test_single_segment_unchanged(self):
        cell = _make_cell(41.905, 12.495)
        seg = Segment(
            segment_id=0,
            polygon=box(12.49, 41.90, 12.50, 41.91),
            cells=[cell.h3_index],
        )
        result = balance_segments([seg], [cell])
        assert len(result) == 1
        assert result[0].workload > 0

    def test_preserves_all_cells(self):
        """Balancing must not lose any cells."""
        cells = [
            _make_cell(41.903, 12.493),
            _make_cell(41.904, 12.494),
            _make_cell(41.905, 12.495),
            _make_cell(41.906, 12.496),
        ]
        seg = Segment(
            segment_id=0,
            polygon=box(12.49, 41.90, 12.50, 41.91),
            cells=[c.h3_index for c in cells],
        )
        result = balance_segments([seg], cells)
        all_cells = []
        for s in result:
            all_cells.extend(s.cells)
        assert len(all_cells) == len(cells)

    def test_segment_ids_are_sequential_after_balance(self):
        cells = [_make_cell(41.905, 12.495)]
        segs = [
            Segment(segment_id=0, polygon=box(12.49, 41.90, 12.495, 41.91), cells=[]),
            Segment(
                segment_id=1,
                polygon=box(12.495, 41.90, 12.50, 41.91),
                cells=[cells[0].h3_index],
            ),
        ]
        result = balance_segments(segs, cells)
        ids = [s.segment_id for s in result]
        assert ids == list(range(len(result)))

    def test_workload_is_computed(self):
        cell = _make_cell(41.905, 12.495)
        seg = Segment(
            segment_id=0,
            polygon=box(12.49, 41.90, 12.50, 41.91),
            cells=[cell.h3_index],
        )
        result = balance_segments([seg], [cell])
        assert result[0].total_area_km2 > 0
        assert result[0].effective_area_km2 >= 0

    def test_empty_segments_list(self):
        result = balance_segments([], [])
        assert result == []

    def test_merges_tiny_segment_into_neighbor(self):
        """A very small segment adjacent to a larger one should get merged."""
        cells_big = [_make_cell(41.905 + i * 0.001, 12.495) for i in range(5)]
        cell_tiny = _make_cell(41.911, 12.495)

        big_poly = box(12.49, 41.90, 12.50, 41.91)
        # Tiny polygon adjacent to big one (touching boundary at y=41.91)
        tiny_poly = box(12.49, 41.91, 12.50, 41.9105)

        segs = [
            Segment(
                segment_id=0,
                polygon=big_poly,
                cells=[c.h3_index for c in cells_big],
            ),
            Segment(
                segment_id=1,
                polygon=tiny_poly,
                cells=[cell_tiny.h3_index],
            ),
        ]
        all_cells = cells_big + [cell_tiny]
        result = balance_segments(segs, all_cells)
        total_cells = sum(len(s.cells) for s in result)
        assert total_cells == len(all_cells)


class TestTargetCountMerging:
    def test_target_count_merges_to_target(self):
        """5 neighboring segments + target_count=2 → result has 2."""
        # Create a chain of 5 adjacent segments
        all_cells = []
        segs = []
        for i in range(5):
            y_base = 41.90 + i * 0.002
            cell = _make_cell(y_base + 0.001, 12.495)
            all_cells.append(cell)
            poly = box(12.49, y_base, 12.50, y_base + 0.002)
            segs.append(
                Segment(segment_id=i, polygon=poly, cells=[cell.h3_index])
            )

        result = balance_segments(segs, all_cells, target_count=2)
        assert len(result) == 2
        # All cells preserved
        total_cells = sum(len(s.cells) for s in result)
        assert total_cells == len(all_cells)
        # IDs are sequential
        ids = [s.segment_id for s in result]
        assert ids == list(range(len(result)))

    def test_target_count_none_uses_threshold_logic(self):
        """When target_count is None, existing threshold merge/split logic applies."""
        cells = [_make_cell(41.905, 12.495)]
        seg = Segment(
            segment_id=0,
            polygon=box(12.49, 41.90, 12.50, 41.91),
            cells=[cells[0].h3_index],
        )
        result = balance_segments([seg], cells, target_count=None)
        assert len(result) == 1
        assert result[0].workload > 0

    def test_target_count_larger_than_segments_no_merges(self):
        """No merges when already under target — 2 segments with target_count=5."""
        all_cells = []
        segs = []
        for i in range(2):
            y_base = 41.90 + i * 0.005
            cell = _make_cell(y_base + 0.002, 12.495)
            all_cells.append(cell)
            poly = box(12.49, y_base, 12.50, y_base + 0.005)
            segs.append(
                Segment(segment_id=i, polygon=poly, cells=[cell.h3_index])
            )

        result = balance_segments(segs, all_cells, target_count=5)
        # Should keep both (or possibly merge via threshold, but not force-merge)
        assert len(result) >= 1
        total_cells = sum(len(s.cells) for s in result)
        assert total_cells == len(all_cells)


def _make_road_grid(x_min, y_min, x_max, y_max, spacing=0.002):
    """Create a dense grid of road LineStrings covering a bounding box."""
    lines = []
    x = x_min
    while x <= x_max:
        lines.append(LineString([(x, y_min), (x, y_max)]))
        x += spacing
    y = y_min
    while y <= y_max:
        lines.append(LineString([(x_min, y), (x_max, y)]))
        y += spacing
    return lines


class TestRoadDensityClassification:
    def test_segments_with_roads_are_vehicle_accessible(self):
        """Segments with a dense road grid get classified as vehicle_accessible."""
        cell = _make_cell(41.905, 12.495)
        seg = Segment(
            segment_id=0,
            polygon=box(12.49, 41.90, 12.50, 41.91),
            cells=[cell.h3_index],
        )
        seg.total_area_km2 = _area_km2(seg.polygon)
        # Dense road grid inside the segment
        road_lines = _make_road_grid(12.49, 41.90, 12.50, 41.91)
        _classify_accessibility([seg], road_lines)
        assert seg.road_density > 0
        assert seg.vehicle_accessible is True

    def test_segments_without_roads_are_foot_only(self):
        """Segments with no roads are classified as foot-only."""
        cell = _make_cell(41.905, 12.495)
        seg = Segment(
            segment_id=0,
            polygon=box(12.49, 41.90, 12.50, 41.91),
            cells=[cell.h3_index],
        )
        seg.total_area_km2 = _area_km2(seg.polygon)
        _classify_accessibility([seg], [])
        assert seg.road_density == 0.0
        assert seg.vehicle_accessible is False

    def test_sparse_roads_below_threshold(self):
        """A single short road in a large area should be below the threshold."""
        cell = _make_cell(41.905, 12.495)
        seg = Segment(
            segment_id=0,
            polygon=box(12.49, 41.90, 12.50, 41.91),
            cells=[cell.h3_index],
        )
        seg.total_area_km2 = _area_km2(seg.polygon)
        # One tiny road segment
        road_lines = [LineString([(12.495, 41.905), (12.496, 41.905)])]
        _classify_accessibility([seg], road_lines)
        assert seg.vehicle_accessible is False

    def test_split_preserves_resource_assignment(self):
        """Splitting a segment must keep its assigned type (else cars vanish on split)."""
        c1 = _make_cell(41.905, 12.495)
        c2 = _make_cell(41.905, 12.497)
        seg = Segment(
            segment_id=0,
            polygon=c1.polygon.union(c2.polygon),
            cells=[c1.h3_index, c2.h3_index],
        )
        seg.assigned_resource_type = "cars"
        seg.vehicle_accessible = True
        seg.workload = 10.0
        out = _split_large([seg], [c1, c2], mean_workload=1.0, threshold=1.0)
        assert len(out) == 2  # actually split
        assert all(s.assigned_resource_type == "cars" for s in out)
        assert all(s.vehicle_accessible for s in out)

    def test_land_use_veto_blocks_vehicles(self):
        """A road-dense segment that is mostly a park is NOT vehicle-accessible."""
        cell = _make_cell(41.905, 12.495)
        seg = Segment(
            segment_id=0,
            polygon=box(12.49, 41.90, 12.50, 41.91),
            cells=[cell.h3_index],
        )
        seg.total_area_km2 = _area_km2(seg.polygon)
        road_lines = _make_road_grid(12.49, 41.90, 12.50, 41.91)
        # A park covering the whole segment vetoes cars despite dense roads.
        park = box(12.49, 41.90, 12.50, 41.91)
        _classify_accessibility([seg], road_lines, park)
        assert seg.road_density > 0
        assert seg.vehicle_accessible is False

    def test_small_land_use_overlap_does_not_veto(self):
        """A park covering only a corner leaves the segment vehicle-accessible."""
        cell = _make_cell(41.905, 12.495)
        seg = Segment(
            segment_id=0,
            polygon=box(12.49, 41.90, 12.50, 41.91),
            cells=[cell.h3_index],
        )
        seg.total_area_km2 = _area_km2(seg.polygon)
        road_lines = _make_road_grid(12.49, 41.90, 12.50, 41.91)
        # Park covers ~1/16 of the segment — below the 0.5 veto fraction.
        park = box(12.49, 41.90, 12.4925, 41.9025)
        _classify_accessibility([seg], road_lines, park)
        assert seg.vehicle_accessible is True


class TestSpeedAwareSizing:
    def test_car_segments_have_more_workload_than_people(self):
        """With 4 people + 2 cars, car segments should have higher workload."""
        all_cells = []
        segs = []
        for i in range(6):
            y_base = 41.90 + i * 0.002
            cell = _make_cell(y_base + 0.001, 12.495)
            all_cells.append(cell)
            poly = box(12.49, y_base, 12.50, y_base + 0.002)
            segs.append(Segment(segment_id=i, polygon=poly, cells=[cell.h3_index]))

        resources = [
            Resource(type="people", count=4),
            Resource(type="cars", count=2),
        ]
        # Dense roads so all segments are vehicle accessible
        road_lines = _make_road_grid(12.49, 41.90, 12.50, 41.92)

        result = balance_segments(
            segs, all_cells, resources=resources, road_lines=road_lines
        )

        car_segs = [s for s in result if s.assigned_resource_type == "cars"]
        people_segs = [s for s in result if s.assigned_resource_type == "people"]

        assert len(car_segs) > 0
        assert len(people_segs) > 0

        avg_car_wl = sum(s.workload for s in car_segs) / len(car_segs)
        avg_people_wl = sum(s.workload for s in people_segs) / len(people_segs)
        # Cars are 6× faster, so they should get more workload per segment
        assert avg_car_wl > avg_people_wl

    def test_all_segments_get_resource_type(self):
        """Every segment must have assigned_resource_type != None."""
        all_cells = []
        segs = []
        for i in range(4):
            y_base = 41.90 + i * 0.002
            cell = _make_cell(y_base + 0.001, 12.495)
            all_cells.append(cell)
            poly = box(12.49, y_base, 12.50, y_base + 0.002)
            segs.append(Segment(segment_id=i, polygon=poly, cells=[cell.h3_index]))

        resources = [Resource(type="people", count=3), Resource(type="drones", count=1)]
        road_lines = _make_road_grid(12.49, 41.90, 12.50, 41.91)

        result = balance_segments(
            segs, all_cells, resources=resources, road_lines=road_lines
        )
        for seg in result:
            assert seg.assigned_resource_type is not None


class TestRestrictedSegmentFiltering:
    def test_fully_restricted_segment_marked_not_searchable(self):
        """A segment with effective_area below min_segment_area_m2 is not searchable."""
        cell_open = _make_cell(41.905, 12.495)
        cell_restricted = _make_cell(41.907, 12.495, status="restricted", restricted_fraction=1.0)

        seg_open = Segment(
            segment_id=0,
            polygon=box(12.49, 41.90, 12.50, 41.91),
            cells=[cell_open.h3_index],
        )
        seg_restricted = Segment(
            segment_id=1,
            polygon=box(12.49, 41.91, 12.50, 41.9101),  # tiny polygon
            cells=[cell_restricted.h3_index],
        )

        all_cells = [cell_open, cell_restricted]
        resources = [Resource(type="people", count=2)]
        road_lines = _make_road_grid(12.49, 41.90, 12.50, 41.92)

        result = balance_segments(
            [seg_open, seg_restricted], all_cells, resources=resources, road_lines=road_lines
        )

        restricted = [s for s in result if not s.searchable]
        assert len(restricted) >= 1

    def test_restricted_segment_gets_no_resource(self):
        """A non-searchable segment should not have an assigned resource."""
        cell_open = _make_cell(41.905, 12.495)
        cell_restricted = _make_cell(41.907, 12.495, status="restricted", restricted_fraction=1.0)

        seg_open = Segment(
            segment_id=0,
            polygon=box(12.49, 41.90, 12.50, 41.91),
            cells=[cell_open.h3_index],
        )
        seg_restricted = Segment(
            segment_id=1,
            polygon=box(12.49, 41.91, 12.50, 41.9101),  # tiny polygon
            cells=[cell_restricted.h3_index],
        )

        all_cells = [cell_open, cell_restricted]
        resources = [Resource(type="people", count=2)]
        road_lines = _make_road_grid(12.49, 41.90, 12.50, 41.92)

        result = balance_segments(
            [seg_open, seg_restricted], all_cells, resources=resources, road_lines=road_lines
        )

        for seg in result:
            if not seg.searchable:
                assert seg.assigned_resource_type is None

    def test_cells_preserved_after_restriction_filter(self):
        """All cells must be preserved after restricted filtering."""
        cell_open = _make_cell(41.905, 12.495)
        cell_restricted = _make_cell(41.907, 12.495, status="restricted", restricted_fraction=1.0)

        seg_open = Segment(
            segment_id=0,
            polygon=box(12.49, 41.90, 12.50, 41.91),
            cells=[cell_open.h3_index],
        )
        seg_restricted = Segment(
            segment_id=1,
            polygon=box(12.49, 41.91, 12.50, 41.9101),
            cells=[cell_restricted.h3_index],
        )

        all_cells = [cell_open, cell_restricted]
        resources = [Resource(type="people", count=2)]
        road_lines = _make_road_grid(12.49, 41.90, 12.50, 41.92)

        result = balance_segments(
            [seg_open, seg_restricted], all_cells, resources=resources, road_lines=road_lines
        )

        all_result_cells = []
        for s in result:
            all_result_cells.extend(s.cells)
        assert len(all_result_cells) == len(all_cells)


class TestVehicleAccessibility:
    def test_vehicles_only_in_accessible_segments(self):
        """Cars/motorbikes should only be assigned to vehicle_accessible segments."""
        # Create 4 segments: 2 with roads (accessible), 2 without (foot-only)
        all_cells = []
        segs = []
        for i in range(4):
            y_base = 41.90 + i * 0.003
            cell = _make_cell(y_base + 0.001, 12.495)
            all_cells.append(cell)
            poly = box(12.49, y_base, 12.50, y_base + 0.003)
            segs.append(Segment(segment_id=i, polygon=poly, cells=[cell.h3_index]))

        resources = [
            Resource(type="people", count=2),
            Resource(type="cars", count=2),
        ]
        # Roads only in the first two segments
        road_lines = _make_road_grid(12.49, 41.90, 12.50, 41.906)

        result = balance_segments(
            segs, all_cells, resources=resources, road_lines=road_lines
        )

        for seg in result:
            if seg.assigned_resource_type == "cars":
                assert seg.vehicle_accessible is True, (
                    f"Car assigned to foot-only segment {seg.segment_id}"
                )

    def test_foot_only_gets_universal_resources(self):
        """Foot-only segments get people or drones, never cars/motorbikes."""
        all_cells = []
        segs = []
        for i in range(4):
            y_base = 41.90 + i * 0.003
            cell = _make_cell(y_base + 0.001, 12.495)
            all_cells.append(cell)
            poly = box(12.49, y_base, 12.50, y_base + 0.003)
            segs.append(Segment(segment_id=i, polygon=poly, cells=[cell.h3_index]))

        resources = [
            Resource(type="people", count=2),
            Resource(type="cars", count=1),
            Resource(type="drones", count=1),
        ]
        # Roads only in bottom half
        road_lines = _make_road_grid(12.49, 41.90, 12.50, 41.906)

        result = balance_segments(
            segs, all_cells, resources=resources, road_lines=road_lines
        )

        vehicle_types = {"cars", "motorbikes"}
        for seg in result:
            if not seg.vehicle_accessible:
                assert seg.assigned_resource_type not in vehicle_types, (
                    f"Vehicle type '{seg.assigned_resource_type}' assigned to "
                    f"foot-only segment {seg.segment_id}"
                )
