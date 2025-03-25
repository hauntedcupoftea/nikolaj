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

// Convert "HH:MM:SS" to seconds since midnight.
function timeToSeconds(t?: string): number {
  if (!t) {
    console.error("Invalid time string", t);
    return 0;
  }
  const [h, m, s] = t.split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

function getMin(arr: number[]): number {
  return arr.reduce((min, cur) => (cur < min ? cur : min), Infinity);
}

function getMax(arr: number[]): number {
  return arr.reduce((max, cur) => (cur > max ? cur : max), -Infinity);
}

function timeFilter(data: DataRow[], start: string, end: string): DataRow[] {
  const startSec = timeToSeconds(start);
  const endSec = timeToSeconds(end);
  if (startSec < endSec) {
    return data.filter((row) => timeToSeconds(row.Time) >= startSec && timeToSeconds(row.Time) < endSec);
  } else {
    return data.filter((row) => timeToSeconds(row.Time) >= startSec || timeToSeconds(row.Time) < endSec);
  }
}

function alphaShape(points: [number, number][], alpha: number, onlyOuter = true): Set<string> {
  if (points.length < 4) throw new Error("Need at least four points");
  const delaunay = Delaunay.from(points);
  const triangles = delaunay.triangles;
  const edges = new Set<string>();

  function addEdge(i: number, j: number) {
    const key1 = `${i}-${j}`;
    const key2 = `${j}-${i}`;
    if (edges.has(key1) || edges.has(key2)) {
      if (onlyOuter) edges.delete(key2);
      return;
    }
    edges.add(key1);
  }

  for (let t = 0; t < triangles.length; t += 3) {
    const ia = triangles[t], ib = triangles[t + 1], ic = triangles[t + 2];
    const pa = points[ia], pb = points[ib], pc = points[ic];
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

async function analyze(data: DataRow[], nCluster: number): Promise<{ longs: number[][]; lats: number[][] }> {
  const validData = data.filter(row =>
    row.Latitude !== undefined &&
    row.Longitude !== undefined &&
    !isNaN(Number(row.Latitude)) &&
    !isNaN(Number(row.Longitude))
  );
  
  const features = validData.map(row => [Number(row.Latitude), Number(row.Longitude)]);
  if (features.length === 0) throw new Error("No valid data for clustering");
  const numClusters = Math.min(nCluster, features.length);
  
  // Consume the kmeans generator.
  const gen = kmeansGenerator(features, numClusters);
  let result;
  for (const iteration of gen) { result = iteration; }
  if (!result || !result.clusters) {
    console.warn("KMeans result missing clusters. Defaulting all points to cluster 0.");
    validData.forEach(row => row.cluster = 0);
  } else {
    const clusters = result.clusters;
    validData.forEach((row, idx) => row.cluster = clusters[idx] ?? 0);
  }
  
  const clusteredData = validData.filter(row => row.cluster !== undefined);
  const Hcenters: [number, number][][] = [];
  const Pedges: Array<Set<string>> = [];
  const uniqueClusters = Array.from(new Set(clusteredData.map(row => row.cluster)));

  for (let clusterId of uniqueClusters) {
    const clusterData = clusteredData.filter(row => row.cluster === clusterId);
    // Use [Longitude, Latitude] to mimic original behavior.
    const clusterFeatures = clusterData.map(row => [Number(row.Longitude), Number(row.Latitude)]);
    const subClusters = Math.max(1, Math.floor(Math.pow(clusterData.length, 0.25)));
    
    const subGen = kmeansGenerator(clusterFeatures, subClusters);
    let subResult;
    for (const iteration of subGen) { subResult = iteration; }
    if (!subResult || !subResult.centroids) continue;
    
    const centers: [number, number][] = subResult.centroids.map(c => c.centroid as [number, number]);
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
    edges.forEach(edgeStr => {
      const [jStr, kStr] = edgeStr.split('-');
      const j = parseInt(jStr), k = parseInt(kStr);
      longs.push([centers[j][0], centers[k][0]]);
      lats.push([centers[j][1], centers[k][1]]);
    });
  }
  return { longs, lats };
}

function genHeatMap(data: DataRow[]): string {
  const lat = data.map(row => Number(row.Latitude)).filter(v => !isNaN(v));
  const lon = data.map(row => Number(row.Longitude)).filter(v => !isNaN(v));
  const z = data.map(row => row.type);
  const centerLat = (getMin(lat) + getMax(lat)) / 2;
  const centerLon = (getMin(lon) + getMax(lon)) / 2;
  
  return `
  <html>
    <head>
      <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
      <style>body { margin: 0; }</style>
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
            style: "open-street-map",
            center: {lat: ${centerLat}, lon: ${centerLon}},
            zoom: 10
          },
          autosize: true
        };
        Plotly.newPlot('heatmap', data, layout);
      </script>
    </body>
  </html>
  `;
}

async function genPatrol(data: DataRow[], n: number): Promise<string> {
  const { longs, lats } = await analyze(data, n);
  let traces;
  if (longs.length === 0 || lats.length === 0) {
    console.warn("No patrol edges computed. Falling back to raw points.");
    traces = [{
      type: 'scattermapbox',
      mode: 'markers',
      lon: data.map(row => Number(row.Longitude)),
      lat: data.map(row => Number(row.Latitude)),
      marker: { size: 6, color: 'blue' }
    }];
  } else {
    traces = longs.map((longPair, i) => ({
      type: 'scattermapbox',
      mode: 'markers+lines',
      lon: longPair,
      lat: lats[i],
      marker: { size: 6, color: 'blue' }
    }));
  }
  
  const allLons = traces.flatMap((trace: any) => trace.lon);
  const allLats = traces.flatMap((trace: any) => trace.lat);
  const center = allLons.length > 0
    ? { lon: (getMin(allLons) + getMax(allLons)) / 2, lat: (getMin(allLats) + getMax(allLats)) / 2 }
    : { lon: 0, lat: 0 };
  
  return `
  <html>
    <head>
      <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
      <style>body { margin: 0; }</style>
    </head>
    <body>
      <div id="map" style="width:100%;height:100vh;"></div>
      <script>
        var data = ${JSON.stringify(traces)};
        var layout = {
          margin: {l:15, t:5, b:5, r:15},
          mapbox: {
            style: "open-street-map",
            center: ${JSON.stringify(center)},
            zoom: 10
          },
          autosize: true,
          showlegend: false
        };
        Plotly.newPlot('map', data, layout);
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
  const [typeGen, setTypeGen] = useState<string>('Heatmap');

  // List of available cities.
  const cities = ['Chicago', 'Los Angeles', 'New York City', 'San Francisco'];

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Build CSV path based on selected city.
    const csvPath = `/datasets/${city}Set.csv`;
    try {
      const response = await fetch(csvPath);
      const text = await response.text();
      const parsed = Papa.parse<DataRow>(text, { header: true, dynamicTyping: true });
      const data = parsed.data
        .filter(row => row.Time !== undefined)
        .map(row => {
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
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err) {
      console.error("Error fetching CSV:", err);
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Project Nikolaj – Browser Processing</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label>
            Select City:
            <select value={city} onChange={(e) => setCity(e.target.value)}>
              {cities.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
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
