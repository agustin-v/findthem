from shapely import STRtree
from shapely.ops import unary_union

from findthem_geo.models.domain import H3Cell, RestrictedArea


def classify_cells(
    cells: list[H3Cell],
    restricted_areas: list[RestrictedArea],
) -> list[H3Cell]:
    """
    Classify H3 cells based on overlap with restricted areas.

    - Fully inside restricted area → status="restricted", fraction=1.0
    - Partially overlapping → status="partial", fraction=overlap/total
    - No overlap → status="open", fraction=0.0
    """
    if not restricted_areas:
        return cells

    restricted_polys = [ra.polygon for ra in restricted_areas if ra.polygon.is_valid]
    if not restricted_polys:
        return cells

    tree = STRtree(restricted_polys)

    for i, cell in enumerate(cells):
        cell_poly = cell.polygon
        candidate_idxs = tree.query(cell_poly)
        if len(candidate_idxs) == 0:
            continue

        # Union the overlapping candidates so stacked areas aren't double-counted.
        blocker = unary_union([restricted_polys[j] for j in candidate_idxs])
        intersection = cell_poly.intersection(blocker)
        if intersection.is_empty:
            continue

        fraction = intersection.area / cell_poly.area

        if fraction >= 0.95:
            cells[i] = cell.model_copy(
                update={"status": "restricted", "restricted_fraction": 1.0}
            )
        elif fraction > 0.05:
            cells[i] = cell.model_copy(
                update={"status": "partial", "restricted_fraction": round(fraction, 4)}
            )

    return cells
