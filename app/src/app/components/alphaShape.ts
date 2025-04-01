import { Delaunay } from "d3-delaunay";

export function alphaShape(points: [number, number][], alpha: number, onlyOuter = true): [number, number][] {
  if (points.length < 4) {
    console.warn("Need at least four points for alpha shape");
    return [];
  }
  try {
    const delaunay = Delaunay.from(points);
    const triangles = delaunay.triangles;
    const edges = new Map<string, [number, number]>();
    function addEdge(i: number, j: number) {
      const key1 = `${i}-${j}`;
      const key2 = `${j}-${i}`;
      if (edges.has(key1) || edges.has(key2)) {
        if (onlyOuter && edges.has(key2)) {
          edges.delete(key2);
        }
        return;
      }
      edges.set(key1, [i, j]);
    }
    for (let t = 0; t < triangles.length; t += 3) {
      const ia = triangles[t];
      const ib = triangles[t + 1];
      const ic = triangles[t + 2];
      const pa = points[ia];
      const pb = points[ib];
      const pc = points[ic];
      const a = Math.sqrt((pa[0] - pb[0]) ** 2 + (pa[1] - pb[1]) ** 2);
      const b = Math.sqrt((pb[0] - pc[0]) ** 2 + (pb[1] - pc[1]) ** 2);
      const c = Math.sqrt((pc[0] - pa[0]) ** 2 + (pc[1] - pa[1]) ** 2);
      const s = (a + b + c) / 2.0;
      const area = Math.sqrt(s * (s - a) * (s - b) * (s - c));
      if (area === 0) continue;
      const circum_r = (a * b * c) / (4.0 * area);
      if (circum_r < alpha) {
        addEdge(ia, ib);
        addEdge(ib, ic);
        addEdge(ic, ia);
      }
    }
    const resultEdges = Array.from(edges.values());
    console.log("Alpha shape edges:", resultEdges);
    return resultEdges;
  } catch (error) {
    console.error("Alpha shape calculation error:", error);
    return [];
  }
}
