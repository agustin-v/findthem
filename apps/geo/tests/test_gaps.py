from shapely.geometry import LineString, Point, box

from findthem_geo.models.domain import Segment
from findthem_geo.services.gaps import apply_road_gaps


def _two_faces_sharing_a_road() -> tuple[Segment, Segment, list[LineString]]:
    """Two adjacent square faces meeting at the centreline x=12.50, plus that road."""
    left = Segment(segment_id=0, polygon=box(12.49, 41.90, 12.50, 41.91))
    right = Segment(segment_id=1, polygon=box(12.50, 41.90, 12.51, 41.91))
    # Left has less work, so it should own the shared road.
    left.workload = 1.0
    right.workload = 2.0
    road = [LineString([(12.50, 41.90), (12.50, 41.91)])]
    return left, right, road


class TestApplyRoadGaps:
    def test_road_owned_by_single_lighter_segment(self):
        left, right, road = _two_faces_sharing_a_road()
        apply_road_gaps([left, right], road, road_half_width_m=4.0, gap_m=5.0)

        # Points spanning the whole road corridor — both edges and the far edge — must
        # all belong to the lighter segment only, never the heavier one (no split).
        for dx in (0.00001, 0.00003, -0.00003):  # ~+1m, ~+3m (far edge), ~-3m
            p = Point(12.50 + dx, 41.905)
            assert left.polygon.covers(p), f"owner should cover road point {dx}"
            assert not right.polygon.covers(p), f"non-owner must not cover road point {dx}"

    def test_road_between_three_segments_each_goes_to_lighter(self):
        """A|B|C in a row: road A-B → A (lighter), road B-C → B (lighter)."""
        a = Segment(segment_id=0, polygon=box(12.49, 41.90, 12.50, 41.91))
        b = Segment(segment_id=1, polygon=box(12.50, 41.90, 12.51, 41.91))
        c = Segment(segment_id=2, polygon=box(12.51, 41.90, 12.52, 41.91))
        a.workload, b.workload, c.workload = 1.0, 2.0, 3.0
        roads = [
            LineString([(12.50, 41.90), (12.50, 41.91)]),
            LineString([(12.51, 41.90), (12.51, 41.91)]),
        ]
        apply_road_gaps([a, b, c], roads, road_half_width_m=4.0, gap_m=5.0)

        on_ab = Point(12.50002, 41.905)
        assert a.polygon.covers(on_ab) and not b.polygon.covers(on_ab)
        on_bc = Point(12.51002, 41.905)
        assert b.polygon.covers(on_bc) and not c.polygon.covers(on_bc)
        # No two segments overlap.
        for x, y in ((a, b), (b, c), (a, c)):
            assert x.polygon.intersection(y.polygon).area == 0.0

    def test_segments_do_not_overlap_and_have_a_gap(self):
        left, right, road = _two_faces_sharing_a_road()
        apply_road_gaps([left, right], road, road_half_width_m=4.0, gap_m=5.0)

        assert left.polygon.intersection(right.polygon).area == 0.0
        # Lighter segment extends across the centreline (owns the road)...
        assert left.polygon.bounds[2] > 12.50
        # ...and the heavier segment starts strictly east of it (a visible gap).
        assert right.polygon.bounds[0] > left.polygon.bounds[2]

    def test_no_roads_is_a_noop(self):
        left = Segment(segment_id=0, polygon=box(12.49, 41.90, 12.50, 41.91))
        original = left.polygon
        apply_road_gaps([left], [], road_half_width_m=4.0, gap_m=5.0)
        assert left.polygon.equals(original)
