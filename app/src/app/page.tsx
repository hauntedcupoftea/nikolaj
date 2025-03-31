'use client';

import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { kmeansGenerator } from 'ml-kmeans';
import { Delaunay } from 'd3-delaunay';

type DataRow = {
  Description: string;
  Latitude: number;
  Longitude: number;
  Time: string;
  type: number;
  City: string;
  cluster?: number;
};

function timeToMs(timeStr: string): number {
  const [h, m, s] = timeStr.split(':').map(Number);
  return ((h * 3600) + (m * 60) + s) * 1000;
}

function timeFilter(data: DataRow[], start: string, end: string): DataRow[] {
  const startTime = new Date(`1900-01-01T${start}`);
  const endTime = new Date(`1900-01-01T${end}`);
  return data.filter(row => {
    if (!row.Time) return false;
    let rowTime;
    if (typeof row.Time === 'string') {
      if (row.Time.includes('T')) {
        rowTime = new Date(row.Time);
      } else {
        rowTime = new Date(`1900-01-01T${row.Time}`);
      }
    } else {
      rowTime = new Date(row.Time);
    }
    const rowHours = rowTime.getHours();
    const rowMinutes = rowTime.getMinutes();
    const rowSeconds = rowTime.getSeconds();
    const timeOnly = new Date(1900, 0, 1, rowHours, rowMinutes, rowSeconds);
    if (startTime < endTime) {
      return timeOnly >= startTime && timeOnly < endTime;
    } else {
      return timeOnly >= startTime || timeOnly < endTime;
    }
  });
}

function getMin(arr: number[]): number {
  return arr.reduce((min, cur) => (cur < min ? cur : min), Infinity);
}

function getMax(arr: number[]): number {
  return arr.reduce((max, cur) => (cur > max ? cur : max), -Infinity);
}

function alphaShape(points: [number, number][], alpha: number, onlyOuter = true): [number, number][] {
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

// The analyze function performs primary clustering internally then secondary clustering on each primary cluster,
// extracts sub-cluster centers (using adjusted logic) and computes alpha shape boundaries.
async function analyze(data: DataRow[], nCluster: number): Promise<{ longs: number[][]; lats: number[][] }> {
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
    let subClusters = Math.floor(Math.pow(clusterPoints.length, 0.35));
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

    // Dump the entire subResult object and its keys for inspection
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

    // Compute alpha shape on the centers.
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

// New async function to generate a combined HTML visualization that plots both primary clusters and secondary boundaries.
async function genCombinedHTMLAsync(data: DataRow[], n: number): Promise<string> {
  // Primary clustering for primary markers
  const features = data
    .filter(row =>
      row.Latitude !== undefined &&
      row.Longitude !== undefined &&
      !isNaN(Number(row.Latitude)) &&
      !isNaN(Number(row.Longitude))
    )
    .map(row => [Number(row.Latitude), Number(row.Longitude)] as [number, number]);
  const primaryKmeans = kmeansGenerator(features, n);
  let primaryResult: any = null;
  for (const iteration of primaryKmeans) {
    primaryResult = iteration;
  }
  const primaryClusters = primaryResult?.clusters;
  const uniquePrimary = Array.from(new Set(primaryClusters));
  const colors = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf"];
  const primaryTraces: any[] = [];
  uniquePrimary.forEach(clusterId => {
    const clusterPoints = data.filter((row, idx) => idx < primaryClusters.length && primaryClusters[idx] === clusterId);
    const lat = clusterPoints.map(row => Number(row.Latitude));
    const lon = clusterPoints.map(row => Number(row.Longitude));
    const color = colors[clusterId % colors.length];
    primaryTraces.push({
      type: 'scattermapbox',
      mode: 'markers',
      lat: lat,
      lon: lon,
      marker: { size: 4, color: color, opacity: 0.6 },
      name: `Primary Cluster ${clusterId}`
    });
  });

  // Get secondary boundaries using analyze (which performs secondary clustering and alpha shape)
  const secondary = await analyze(data, n);
  const secondaryTraces: any[] = [];
  secondary.longs.forEach((lonPair, index) => {
    const latPair = secondary.lats[index];
    const color = colors[index % colors.length];
    secondaryTraces.push({
      type: 'scattermapbox',
      mode: 'lines+markers',
      lon: lonPair,
      lat: latPair,
      line: { width: 3, color: color },
      marker: { size: 6, color: color },
      name: `Secondary Boundary ${index}`
    });
  });
  const allTraces = primaryTraces.concat(secondaryTraces);

  // Compute overall map center from all data.
  const allLats = data.map(row => Number(row.Latitude));
  const allLons = data.map(row => Number(row.Longitude));
  const centerLat = allLats.length ? (getMin(allLats) + getMax(allLats)) / 2 : 0;
  const centerLon = allLons.length ? (getMin(allLons) + getMax(allLons)) / 2 : 0;

  return `
  <!DOCTYPE html>
  <html>
    <head>
      <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
      <style>
        body, html, #map {
          width: 100%;
          height: 100%;
          margin: 0;
          padding: 0;
          background: #ffffff;
          color: #000000;
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var data = ${JSON.stringify(allTraces)};
        var layout = {
          margin: {l:0, t:0, b:0, r:0},
          mapbox: {
            style: "open-street-map",
            center: { lat: ${centerLat}, lon: ${centerLon} },
            zoom: 10
          },
          autosize: true,
          showlegend: true
        };
        var config = { responsive: true };
        Plotly.newPlot('map', data, layout, config);
        window.addEventListener('resize', function() {
          Plotly.Plots.resize(document.getElementById('map'));
        });
      </script>
    </body>
  </html>
  `;
}

export default function HomePage() {
  const [city, setCity] = useState<string>('Chicago');
  const [startTime, setStartTime] = useState<string>('08:45:00');
  const [endTime, setEndTime] = useState<string>('17:35:00');
  const [n, setN] = useState<number>(85);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DataRow[]>([]);
  const [combinedHtml, setCombinedHtml] = useState<string>('');
  const [isDataLoaded, setIsDataLoaded] = useState<boolean>(false);

  const cities = ['Chicago', 'Los Angeles', 'New York', 'San Francisco'];

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/datasets/crime_data.csv');
        if (!response.ok) {
          throw new Error(`Failed to fetch data: ${response.statusText}`);
        }
        const text = await response.text();
        const parsed = Papa.parse<DataRow>(text, { header: true, dynamicTyping: true });
        const processed = parsed.data
          .filter(row => row.Description && row.Latitude && row.Longitude && row.Time && row.City)
          .map(row => {
            if (typeof row.Time === 'string' && row.Time.includes(' ')) {
              row.Time = row.Time.split(' ')[1];
            }
            const primSeverityMap: Record<string, number> = {
              'NON - CRIMINAL': 0, 'NON-CRIMINAL (SUBJECT SPECIFIED)': 0, 'NON-CRIMINAL': 0,
              'INTIMIDATION': 1, 'OBSCENITY': 1, 'OTHER OFFENSE': 1, 'PUBLIC INDECENCY': 1,
              'LIQUOR LAW VIOLATION': 2, 'PUBLIC PEACE VIOLATION': 2, 'CONCEALED CARRY LICENSE VIOLATION': 2,
              'PROSTITUTION': 3, 'GAMBLING': 3, 'INTERFERENCE WITH PUBLIC OFFICER': 3, 'STALKING': 3,
              'ARSON': 6, 'BURGLARY': 5, 'BATTERY': 2, 'ROBBERY': 5, 'SEX OFFENSE': 5, 'ASSAULT': 3,
              'THEFT': 4, 'DECEPTIVE PRACTICE': 5, 'CRIMINAL TRESPASS': 4, 'CRIMINAL DAMAGE': 4, 'WEAPONS VIOLATION': 5,
              'MOTOR VEHICLE THEFT': 5, 'OFFENSE INVOLVING CHILDREN': 5, 'KIDNAPPING': 5, 'NARCOTICS': 5,
              'OTHER NARCOTIC VIOLATION': 4, 'HUMAN TRAFFICKING': 6, 'CRIM SEXUAL ASSAULT': 6, 'HOMICIDE': 6
            };
            if (row.Description && primSeverityMap[row.Description]) {
              row.type = primSeverityMap[row.Description];
            } else {
              row.type = 0;
            }
            return row;
          });
        console.log("Data loaded:", processed.length, "rows");
        setData(processed);
        setIsDataLoaded(true);
      } catch (err) {
        console.error("Failed to load data:", err);
        setError("Failed to load crime data. Please try again later.");
      }
    };
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (!isDataLoaded) {
        throw new Error("Data is still loading. Please try again in a moment.");
      }
      const cityData = data.filter(row => row.City === city);
      console.log(`Data for ${city}:`, cityData.length, "rows");
      if (cityData.length === 0) {
        throw new Error(`No data available for ${city}`);
      }
      const filteredData = timeFilter(cityData, startTime, endTime);
      console.log("Filtered data count:", filteredData.length);
      if (filteredData.length === 0) {
        throw new Error(`No data available for the selected time range in ${city}`);
      }
      const combinedContent = await genCombinedHTMLAsync(filteredData, n);
      setCombinedHtml(combinedContent);
    } catch (err) {
      console.error("Error generating visualization:", err);
      setError(err instanceof Error ? err.message : "An unknown error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-screen" style={{ backgroundColor: "#ffffff", color: "#000000" }}>
      {/* Controls Panel */}
      <div className="lg:w-1/4 p-6 bg-white overflow-auto text-black">
        <h1 className="text-3xl font-bold mb-6">Project Nikolaj</h1>
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            <strong>Error:</strong> {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block mb-2">
              Select City:
              <select 
                value={city} 
                onChange={(e) => setCity(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded mt-1"
              >
                {cities.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <label className="block mb-2">
              Start Time (HH:MM:SS):
              <input 
                type="text" 
                value={startTime} 
                onChange={(e) => setStartTime(e.target.value)} 
                required
                className="w-full p-2 border border-gray-300 rounded mt-1"
                pattern="([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]"
                title="Time format: HH:MM:SS"
              />
            </label>
          </div>
          <div>
            <label className="block mb-2">
              End Time (HH:MM:SS):
              <input 
                type="text" 
                value={endTime} 
                onChange={(e) => setEndTime(e.target.value)} 
                required
                className="w-full p-2 border border-gray-300 rounded mt-1"
                pattern="([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]"
                title="Time format: HH:MM:SS"
              />
            </label>
          </div>
          <div>
            <label className="block mb-2">
              Number of Clusters (n):
              <input 
                type="number" 
                value={n} 
                onChange={(e) => setN(Number(e.target.value))} 
                required
                min="1"
                max="500"
                className="w-full p-2 border border-gray-300 rounded mt-1"
              />
            </label>
          </div>
          <button 
            type="submit" 
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-blue-300 w-full"
            disabled={loading || !isDataLoaded}
          >
            {loading ? 'Generating...' : isDataLoaded ? 'Generate Visualization' : 'Loading Data...'}
          </button>
        </form>
      </div>
      {/* Visualization Panel */}
      <div className="lg:w-3/8 flex-1 flex flex-col">
        <div className="h-full border-l p-2">
          {combinedHtml ? (
            <iframe 
              srcDoc={combinedHtml}
              className="w-full h-full border-0"
              title="Combined Visualization"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-500">
              {loading ? 'Generating visualization...' : 'Generate visualization to see combined primary and secondary clusters'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
