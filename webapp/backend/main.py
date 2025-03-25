'use client';

import React, { useState } from 'react';
import Papa from 'papaparse';
import { kmeansGenerator } from 'ml-kmeans';
import { Delaunay } from 'd3-delaunay';

type DataRow = {
  Time: string;
  Latitude: number;
  Longitude: number;
  type: number; // Assuming numeric severity for heatmap
  cluster?: number;
};

// Convert "HH:MM:SS" to seconds since midnight, safely handling undefined.
function timeToSeconds(t?: string): number {
  if (!t) {
    console.error("Invalid time string", t);
    return 0;
  }
  const [h, m, s] = t.split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

// Helper functions to compute minimum and maximum values using reduce.
function getMin(arr: number[]): number {
  return arr.reduce((min, cur) => (cur < min ? cur : min), Infinity);
}

function getMax(arr: number[]): number {
  return arr.reduce((max, cur) => (cur > max ? cur : max), -Infinity);
}

// Filter the dataset based on a start and end time.
function timeFilter(data: DataRow[], start: string, end: string): DataRow[] {
  const startSec = timeToSeconds(start);
  const endSec = timeToSeconds(end);
  if (startSec < endSec) {
    return data.filter((row) => {
      const sec = timeToSeconds(row.Time);
      return sec >= startSec && sec < endSec;
    });
  } else {
    // Handles time ranges that cross midnight.
    return data.filter((row) => {
      const sec = timeToSeconds(row.Time);
      return sec >= startSec || sec < endSec;
    });
  }
}

// Compute an alpha shape (outline) using Delaunay triangulation.
function alphaShape(points: [number, number][], alpha: number, onlyOuter = true): Set<string> {
  if (points.length < 4) throw new Error("Need at least four points");
  const delaunay = Delaunay.from(points);
  const triangles = delaunay.triangles;
  const edges = new Set<string>();

  function addEdge(i: number, j: number) {
    const key1 = `${i}-${j}`;
    const key2 = `${j}-${i}`;
    if (edges.has(key1) || edges.has(key2)) {
      if (onlyOuter) {
        edges.delete(key2);
      }
      return;
    }
    edges.add(key1);
  }

  for (let t = 0; t < triangles.length; t += 3) {
    const ia = triangles[t],
      ib = triangles[t + 1],
      ic = triangles[t + 2];
    const pa = points[ia],
      pb = points[ib],
      pc = points[ic];
    const a = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]);
    const b = Math.hypot(pb[0] - pc[0], pb[1] - pc[1]);
    const c = Math.hypot(pc[0] - pa[0], pc[1] - pa[1]);
    const s = (a + b + c) / 2;
    const area = Math.sqrt(s * (s - a) * (s - b) * (s - c));
    if (area === 0) continue;
    const circum_r = (a * b * c) / (4.0 * area);
    if (circum_r < alpha) {
      addEdge(ia, ib);
      addEdge(ib, ic);
      addEdge(ic, ia);
    }
  }
  return edges;
}

// Analyze the filtered data:
// 1. Filter out rows that don't have valid Latitude/Longitude values.
// 2. Adjust number of clusters if needed, then run k-means on the valid rows.
// 3. For each cluster, run sub-clustering and compute the alpha shape.
async function analyze(data: DataRow[], nCluster: number): Promise<{ longs: number[][]; lats: number[][] }> {
  // Filter out invalid rows.
  const validData = data.filter(
    (row) =>
      row.Latitude !== undefined &&
      row.Longitude !== undefined &&
      !isNaN(Number(row.Latitude)) &&
      !isNaN(Number(row.Longitude))
  );
  
  const features = validData.map((row) => [Number(row.Latitude), Number(row.Longitude)]);
  if (features.length === 0) {
    throw new Error("No valid data for clustering");
  }
  // Ensure we don't request more clusters than available rows.
  const numClusters = Math.min(nCluster, features.length);
  
  // Use kmeansGenerator as a generator and consume it.
  const gen = kmeansGenerator(features, numClusters);
  let result;
  for (const iteration of gen) {
    result = iteration;
  }
  if (!result) {
    throw new Error("KMeans did not converge");
  }
  const clusters = result.clusters;
  
  // Check if cluster assignments exist and match validData length.
  if (!clusters || clusters.length !== validData.length) {
    console.warn("Cluster assignments missing or length mismatch. Assigning default cluster 0 to all.");
    validData.forEach((row) => (row.cluster = 0));
  } else {
    validData.forEach((row, idx) => {
      row.cluster = clusters[idx] !== undefined ? clusters[idx] : 0;
    });
  }
  
  const clusteredData = validData.filter((row) => row.cluster !== undefined);
  
  const Hcenters: [number, number][][] = [];
  const Pedges: Array<Set<string>> = [];
  const uniqueClusters = Array.from(new Set(clusteredData.map((row) => row.cluster)));

  for (let clusterId of uniqueClusters) {
    const clusterData = clusteredData.filter((row) => row.cluster === clusterId);
    // Using [Longitude, Latitude] to mimic original behavior.
    const clusterFeatures = clusterData.map((row) => [Number(row.Longitude), Number(row.Latitude)]);
    const subClusters = Math.max(1, Math.floor(Math.pow(clusterData.length, 0.25)));
    
    const subGen = kmeansGenerator(clusterFeatures, subClusters);
    let subResult;
    for (const iteration of subGen) {
      subResult = iteration;
    }
    if (!subResult) continue;
    
    // Assume centroids are stored in subResult.centroids.
    const centers: [number, number][] = subResult.centroids.map((c) => c.centroid as [number, number]);
    try {
      const edges = alphaShape(centers, 1);
      Hcenters.push(centers);
      Pedges.push(edges);
    } catch (e) {
      continue;
    }
  }
  
  const longs: number[][] = [];
  const lats: number[][] = [];
  for (let i = 0; i < Hcenters.length; i++) {
    const centers = Hcenters[i];
    const edges = Pedges[i];
    edges.forEach((edgeStr) => {
      const [jStr, kStr] = edgeStr.split('-');
      const j = parseInt(jStr),
            k = parseInt(kStr);
      longs.push([centers[j][0], centers[k][0]]);
      lats.push([centers[j][1], centers[k][1]]);
    });
  }
  return { longs, lats };
}

// Generate a heatmap HTML page (using Plotly.js via CDN) while avoiding the spread operator on large arrays.
function genHeatMap(data: DataRow[]): string {
  const lat = data.map((row) => Number(row.Latitude)).filter((v) => !isNaN(v));
  const lon = data.map((row) => Number(row.Longitude)).filter((v) => !isNaN(v));
  const z = data.map((row) => row.type);
  const centerLat = (getMin(lat) + getMax(lat)) / 2;
  const centerLon = (getMin(lon) + getMax(lon)) / 2;
  return `
  <html>
    <head>
      <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
    </head>
    <body>
      <div id="heatmap" style="width:100%;height:100vh;"></div>
      <script>
        var data = [{
          type: 'densitymapbox',
          lat: ${JSON.stringify(lat)},
          lon: ${JSON.stringify(lon)},
          z: ${JSON.stringify(z)},
          radius: 3
        }];
        var layout = {
          margin: {l:15, t:5, b:5, r:15},
          mapbox: {
            style: "stamen-terrain",
            center: {lat: ${centerLat}, lon: ${centerLon}},
            zoom: 10
          }
        };
        Plotly.newPlot('heatmap', data, layout);
      </script>
    </body>
  </html>
  `;
}

// Generate a patrol HTML page using the analyze() function.
async function genPatrol(data: DataRow[], n: number): Promise<string> {
  const { longs, lats } = await analyze(data, n);
  const traces = longs.map((longPair, i) => {
    return {
      type: 'scattermapbox',
      mode: 'markers+lines',
      lon: longPair,
      lat: lats[i],
      marker: { size: 6, color: 'blue' }
    };
  });
  const allLons = longs.flat();
  const allLats = lats.flat();
  const center =
    allLons.length > 0
      ? {
          lon: (getMin(allLons) + getMax(allLons)) / 2,
          lat: (getMin(allLats) + getMax(allLats)) / 2,
        }
      : { lon: 0, lat: 0 };
  return `
  <html>
    <head>
      <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
    </head>
    <body>
      <div id="map" style="width:100%;height:100vh;"></div>
      <script>
        var data = ${JSON.stringify(traces)};
        var layout = {
          margin: {l:15, t:5, b:5, r:15},
          mapbox: {
            center: ${JSON.stringify(center)},
            style: "stamen-terrain",
            zoom: 10
          },
          showlegend: false
        };
        Plotly.newPlot('map', data, layout);
      </script>
    </body>
  </html>
  `;
}

export default function HomePage() {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [startTime, setStartTime] = useState<string>('08:45:00');
  const [endTime, setEndTime] = useState<string>('17:35:00');
  const [n, setN] = useState<number>(85);
  const [typeGen, setTypeGen] = useState<string>('Heatmap');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setCsvFile(e.target.files[0]);
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!csvFile) return alert("Please upload a CSV file.");
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result;
      if (typeof text === 'string') {
        // Parse CSV with PapaParse.
        const parsed = Papa.parse<DataRow>(text, { header: true, dynamicTyping: true });
        // Ensure each row has a valid Time field.
        const data = parsed.data
          .filter((row) => row.Time !== undefined)
          .map((row) => {
            if (typeof row.Time === 'string') {
              row.Time = row.Time.slice(-8);
            }
            return row;
          });
        const filteredData = timeFilter(data, startTime, endTime);
        let htmlContent = '';
        if (typeGen === 'Heatmap') {
          htmlContent = genHeatMap(filteredData);
        } else if (typeGen === 'Patrol') {
          htmlContent = await genPatrol(filteredData, n);
        }
        // Create a Blob URL and open it in a new tab.
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      }
    };
    reader.readAsText(csvFile);
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Project Nikolaj – Browser Processing</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label>
            Upload CSV File:
            <input type="file" accept=".csv" onChange={handleFileChange} required />
          </label>
        </div>
        <div>
          <label>
            Start Time (HH:MM:SS):
            <input type="text" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
          </label>
        </div>
        <div>
          <label>
            End Time (HH:MM:SS):
            <input type="text" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
          </label>
        </div>
        <div>
          <label>
            Number of Clusters (n):
            <input type="number" value={n} onChange={(e) => setN(Number(e.target.value))} required />
          </label>
        </div>
        <div>
          <label>
            Visualization Type:
            <select value={typeGen} onChange={(e) => setTypeGen(e.target.value)}>
              <option value="Heatmap">Heatmap</option>
              <option value="Patrol">Patrol</option>
            </select>
          </label>
        </div>
        <button type="submit">Generate Visualization</button>
      </form>
    </div>
  );
}
