import { DataRow } from "../types";
import { alphaShape } from "./alphaShape";

// Note: We assume that ml-kmeans is installed.
import { kmeansGenerator } from "ml-kmeans";

export async function analyze(data: DataRow[], nCluster: number): Promise<{ longs: number[][]; lats: number[][] }> {
  // Primary clustering on [Latitude, Longitude]
  const features = data
    .filter(row =>
      row.Latitude !== undefined &&
      row.Longitude !== undefined &&
      !isNaN(Number(row.Latitude)) &&
      !isNaN(Number(row.Longitude))
    )
    .map(row => [Number(row.Latitude), Number(row.Longitude)] as [number, number]);
  console.log("Primary clustering - total feature points:", features.length);
  const actualNClusters = Math.min(nCluster, features.length);
  if (actualNClusters < 1 || features.length < 1) {
    return { longs: [], lats: [] };
  }
  const primaryKmeans = kmeansGenerator(features, actualNClusters);
  let primaryResult: any = null;
  for (const iteration of primaryKmeans) {
    primaryResult = iteration;
  }
  if (!primaryResult || !primaryResult.clusters) {
    console.error("Primary clustering failed to produce clusters");
    return { longs: [], lats: [] };
  }
  const primaryClusters = primaryResult.clusters;
  console.log("Primary cluster assignments (first 20):", primaryClusters.slice(0, 20));

  // For each primary cluster, perform secondary (sub) clustering.
  const Hcenters: [number, number][][] = [];
  const Pedges: [number, number][][] = [];
  const uniqueClusters = Array.from(new Set(primaryClusters));
  console.log("Unique primary clusters:", uniqueClusters);

  for (const clusterId of uniqueClusters) {
    // Extract points for this primary cluster (swap order to [Longitude, Latitude])
    const clusterPoints = data
      .filter((row, idx) => idx < primaryClusters.length && primaryClusters[idx] === clusterId)
      .map(row => [Number(row.Longitude), Number(row.Latitude)] as [number, number]);

    console.log(`\nPrimary cluster ${clusterId}:`);
    console.log("  Total points in cluster:", clusterPoints.length);
    if (clusterPoints.length < 4) {
      console.warn(`  Skipping cluster ${clusterId} because it has fewer than 4 points.`);
      continue;
    }

    // Calculate number of sub-clusters using floor(clusterPoints.length^(0.25))
    let subClusters = Math.floor(Math.pow(clusterPoints.length, 0.25));
    if (subClusters < 1) subClusters = 1;
    console.log("  Computed number of sub-clusters:", subClusters);
    console.log("  Sample clusterPoints (first 5):", clusterPoints.slice(0, 5));

    // Run secondary clustering on the clusterPoints
    const subKmeans = kmeansGenerator(clusterPoints, subClusters);
    let subResult: any = null;
    let iterationCount = 0;
    for (const iteration of subKmeans) {
      subResult = iteration;
      iterationCount++;
    }
    console.log("  Secondary clustering iterations:", iterationCount);

    console.log("  Full subResult object:", subResult);
    console.log("  Keys in subResult:", Object.keys(subResult));

    if (!subResult || !subResult.centroids) {
      console.warn(`  Sub clustering failed for primary cluster ${clusterId} (no centroids found).`);
      continue;
    }

    // Adjusted extraction: use c.centroid if exists; otherwise, use c directly.
    const centers = subResult.centroids.map((c: any) => c.centroid ? c.centroid : c) as [number, number][];
    console.log("  Extracted sub-cluster centers:", centers);

    if (centers.length < 4) {
      console.warn(`  Primary cluster ${clusterId} does not have enough sub-cluster centers (${centers.length}) for alpha shape.`);
      continue;
    }

    let edges: [number, number][] = [];
    try {
      edges = alphaShape(centers, 1);
      console.log(`  Alpha shape edges for primary cluster ${clusterId}:`, edges);
    } catch (e) {
      console.warn(`  Alpha shape computation failed for primary cluster ${clusterId}:`, e);
      continue;
    }

    if (edges.length > 0) {
      Hcenters.push(centers);
      Pedges.push(edges);
    } else {
      console.warn(`  No valid alpha shape edges found for primary cluster ${clusterId}.`);
    }
  }
  // Process Hcenters and Pedges to generate long/lat pairs.
  const longs: number[][] = [];
  const lats: number[][] = [];
  for (let i = 0; i < Hcenters.length; i++) {
    const centers = Hcenters[i];
    const edges = Pedges[i];
    for (const [j, k] of edges) {
      if (j < centers.length && k < centers.length) {
        // In centers, index 0 = longitude, index 1 = latitude.
        const lonPair = [centers[j][0], centers[k][0]];
        const latPair = [centers[j][1], centers[k][1]];
        longs.push(lonPair);
        lats.push(latPair);
      }
    }
  }
  console.log("Final aggregated alpha shape edges count:", longs.length);
  return { longs, lats };
}
