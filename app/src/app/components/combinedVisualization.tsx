import React from "react";
import { DataRow } from "../types";
import { getMin, getMax } from "./utils";

// Define an interface for Plotly scattermapbox traces.
export interface ScatterMapboxTrace {
  type: "scattermapbox";
  mode: string;
  lat: number[];
  lon: number[];
  marker: {
    size: number;
    color: string;
    opacity?: number;
  };
  name: string;
  showlegend?: boolean;
  line?: {
    width: number;
    color: string;
  };
}

// Generates a heatmap HTML string using Plotly's densitymapbox.
// The colorscale is defined as red, orange, yellow, green, cyan, dark blue.
export function genHeatMapHTML(data: DataRow[]): string {
  const validData = data.filter(
    (row) =>
      row.Latitude !== undefined &&
      row.Longitude !== undefined &&
      !isNaN(Number(row.Latitude)) &&
      !isNaN(Number(row.Longitude))
  );
  const lat = validData.map((row) => Number(row.Latitude));
  const lon = validData.map((row) => Number(row.Longitude));
  const colorscale = [
    [0, "red"],
    [0.2, "orange"],
    [0.4, "yellow"],
    [0.6, "green"],
    [0.8, "cyan"],
    [1, "darkblue"],
  ];
  const z = validData.map((row) => row.type || 0);
  const centerLat = lat.length ? (getMin(lat) + getMax(lat)) / 2 : 0;
  const centerLon = lon.length ? (getMin(lon) + getMax(lon)) / 2 : 0;

  return `
  <!DOCTYPE html>
  <html>
    <head>
      <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
      <style>
        body, html, #heatmap {
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
      <div id="heatmap"></div>
      <script>
        var data = [{
          type: 'densitymapbox',
          lat: ${JSON.stringify(lat)},
          lon: ${JSON.stringify(lon)},
          z: ${JSON.stringify(z)},
          radius: 3,
          colorscale: ${JSON.stringify(colorscale)},
        }];
        var layout = {
          margin: {l:0, t:0, b:0, r:0},
          mapbox: {
            style: "carto-darkmatter",
            center: {lat: ${centerLat}, lon: ${centerLon}},
            zoom: 10
          },
          autosize: true
        };
        var config = { responsive: true };
        Plotly.newPlot('heatmap', data, layout, config);
        window.addEventListener('resize', function() {
          Plotly.Plots.resize(document.getElementById('heatmap'));
        });
      </script>
    </body>
  </html>
  `;
}

// Generates a clusters HTML string that overlays primary cluster markers with secondary clustering boundaries.
export async function genClustersHTML(data: DataRow[], n: number): Promise<string> {
  const { kmeansGenerator } = await import("ml-kmeans");
  const features = data
    .filter(row =>
      row.Latitude !== undefined &&
      row.Longitude !== undefined &&
      !isNaN(Number(row.Latitude)) &&
      !isNaN(Number(row.Longitude))
    )
    .map(row => [Number(row.Latitude), Number(row.Longitude)] as [number, number]);
  // Supply an empty options object.
  const primaryKmeans = kmeansGenerator(features, n, {}) as IterableIterator<{ clusters: number[] }>;
  let primaryResult: { clusters: number[] } | null = null;
  for (const iteration of primaryKmeans) {
    primaryResult = iteration;
  }
  const primaryClusters = primaryResult?.clusters;
  const uniquePrimary = Array.from(new Set(primaryClusters)) as number[];
  const colors = [
    "#1f77b4",
    "#ff7f0e",
    "#2ca02c",
    "#d62728",
    "#9467bd",
    "#8c564b",
    "#e377c2",
    "#7f7f7f",
    "#bcbd22",
    "#17becf"
  ];
  const primaryTraces: ScatterMapboxTrace[] = [];
  uniquePrimary.forEach((clusterId: number) => {
    const clusterPoints = data.filter(
      (row, idx) => idx < primaryClusters!.length && primaryClusters![idx] === clusterId
    );
    const lat = clusterPoints.map((row) => Number(row.Latitude));
    const lon = clusterPoints.map((row) => Number(row.Longitude));
    // Explicitly use clusterId as number.
    const color = colors[clusterId % colors.length];
    primaryTraces.push({
      type: "scattermapbox",
      mode: "markers",
      lat: lat,
      lon: lon,
      marker: { size: 4, color: color, opacity: 0.6 },
      name: `Primary Cluster ${clusterId}`
    });
  });

  const { analyze } = await import("./clustering");
  const secondary = await analyze(data, n);
  const secondaryTraces: ScatterMapboxTrace[] = [];
  secondary.longs.forEach((lonPair: number[], index: number) => {
    const latPair = secondary.lats[index];
    const color = colors[index % colors.length];
    secondaryTraces.push({
      type: "scattermapbox",
      mode: "lines+markers",
      lon: lonPair,
      lat: latPair,
      line: { width: 3, color: color },
      marker: { size: 6, color: color },
      showlegend: false,
      name: `Secondary Boundary ${index}`
    });
  });
  const allTraces: ScatterMapboxTrace[] = primaryTraces.concat(secondaryTraces);
  const allLats = data.map((row) => Number(row.Latitude));
  const allLons = data.map((row) => Number(row.Longitude));
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
          showlegend: false
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

type CombinedVisualizationProps = {
  heatmapHtml: string;
  clustersHtml: string;
};

export default function CombinedVisualization({ heatmapHtml, clustersHtml }: CombinedVisualizationProps) {
  return (
    <div style={{ display: "flex", flexDirection: "row", height: "100%" }}>
      {/* Patrol plot (clusters with secondary boundaries) on left */}
      <div style={{ flex: 1, borderRight: "1px solid #ccc" }}>
        {clustersHtml ? (
          <iframe srcDoc={clustersHtml} style={{ width: "100%", height: "100%", border: 0 }} title="Patrol Plot" />
        ) : (
          <div>Patrol Plot not generated</div>
        )}
      </div>
      {/* Heatmap on right */}
      <div style={{ flex: 1 }}>
        {heatmapHtml ? (
          <iframe srcDoc={heatmapHtml} style={{ width: "100%", height: "100%", border: 0 }} title="Heatmap" />
        ) : (
          <div>Heatmap not generated</div>
        )}
      </div>
    </div>
  );
}
