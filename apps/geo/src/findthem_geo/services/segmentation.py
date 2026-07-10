import geopandas as gpd
import pandas as pd
from shapely import STRtree
from shapely.geometry import Polygon

from findthem_geo.models.domain import H3Cell, Segment


def assign_cells_to_segments(
    cells: list[H3Cell],
    road_polygons: list[Polygon],
) -> list[Segment]:
    """
    Assign H3 cells to road-bounded polygon segments via spatial join.

    Each cell's centroid determines its containing segment.
    Unassigned cells go to the nearest segment by distance.
    """
    if not road_polygons:
        seg = Segment(
            segment_id=0,
            polygon=Polygon(),
            cells=[c.h3_index for c in cells],
        )
        return [seg]

    seg_gdf = gpd.GeoDataFrame(
        {"segment_id": list(range(len(road_polygons)))},
        geometry=road_polygons,
    )

    centroids = [cell.polygon.centroid for cell in cells]
    cell_gdf = gpd.GeoDataFrame(
        {"h3_index": [c.h3_index for c in cells], "cell_idx": list(range(len(cells)))},
        geometry=centroids,
    )

    joined = gpd.sjoin(cell_gdf, seg_gdf, how="left", predicate="within")
    joined = joined[~joined.index.duplicated(keep="first")]

    assignment: dict[int, list[str]] = {i: [] for i in range(len(road_polygons))}
    unassigned: list[int] = []

    for _, row in joined.iterrows():
        cell_idx = int(row["cell_idx"])
        if pd.notna(row["segment_id"]):
            seg_id = int(row["segment_id"])
            assignment[seg_id].append(cells[cell_idx].h3_index)
            cells[cell_idx] = cells[cell_idx].model_copy(update={"segment_id": seg_id})
        else:
            unassigned.append(cell_idx)

    if unassigned:
        tree = STRtree(road_polygons)
        for cell_idx in unassigned:
            best_seg = int(tree.nearest(centroids[cell_idx]))
            assignment[best_seg].append(cells[cell_idx].h3_index)
            cells[cell_idx] = cells[cell_idx].model_copy(update={"segment_id": best_seg})

    segments = []
    for seg_id, poly in enumerate(road_polygons):
        seg = Segment(
            segment_id=seg_id,
            polygon=poly,
            cells=assignment[seg_id],
        )
        segments.append(seg)

    return segments
