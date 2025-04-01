import React, { useEffect, useState } from "react";
import { DataRow } from "../types";
import { getMin, getMax } from "./utils";

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
  // Define the colorscale spectrum.
  const colorscale = [
    [0, "red"],
    [0.2, "orange"],
    [0.4, "yellow"],
    [0.6, "green"],
    [0.8, "cyan"],
    [1, "darkblue"],
  ];
  // Use the 'type' property as weight; change to ones for pure frequency.
  const z = validData.map((row) => row.type || 0);
  // Use our helper functions to compute min and max.
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
          radius: 10,
          colorscale: ${JSON.stringify(colorscale)}
        }];
        var layout = {
          margin: {l:0, t:0, b:0, r:0},
          mapbox: {
            style: "open-street-map",
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
// The primary clusters are plotted as markers and the secondary (patrol) boundaries are overlaid as lines+markers with no legend.
export async function genClustersHTML(data: DataRow[], n: number): Promise<string> {
  // Import ml-kmeans dynamically (assumed installed)
  const { kmeansGenerator } = await import("ml-kmeans");
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
      type: "scattermapbox",
      mode: "markers",
      lat: lat,
      lon: lon,
      marker: { size: 4, color: color, opacity: 0.6 },
      name: `Primary Cluster ${clusterId}`
    });
  });

  // Get secondary boundaries using the analyze function.
  const { analyze } = await import("./clustering");
  const secondary = await analyze(data, n);
  const secondaryTraces: any[] = [];
  secondary.longs.forEach((lonPair, index) => {
    const latPair = secondary.lats[index];
    const color = colors[index % colors.length];
    secondaryTraces.push({
      type: "scattermapbox",
      mode: "lines+markers",
      lon: lonPair,
      lat: latPair,
      line: { width: 3, color: color },
      marker: { size: 6, color: color },
      showlegend: false,  // Remove legend for secondary boundaries.
      name: `Secondary Boundary ${index}`
    });
  });
  const allTraces = primaryTraces.concat(secondaryTraces);

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

// CombinedVisualization renders two iframes side-by-side: patrol plot on left and heatmap on right.
type CombinedVisualizationProps = {
  heatmapHtml: string;
  clustersHtml: string;
};

export default function CombinedVisualization({ heatmapHtml, clustersHtml }: CombinedVisualizationProps) {
  return (
    <div style={{ display: "flex", flexDirection: "row", height: "100%" }}>
      {/* Patrol (clusters with secondary boundaries) on left */}
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
