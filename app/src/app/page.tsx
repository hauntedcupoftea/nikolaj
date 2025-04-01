'use client';

import React, { useState, useEffect } from "react";
import Papa from "papaparse";
import CombinedVisualization, { genHeatMapHTML, genClustersHTML } from "./components/combinedVisualization";
import { DataRow } from "./types";

export default function HomePage() {
  const [city, setCity] = useState<string>("Chicago");
  const [startTime, setStartTime] = useState<string>("08:00:00");
  const [endTime, setEndTime] = useState<string>("14:00:00");
  const [n, setN] = useState<number>(8);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DataRow[]>([]);
  const [heatmapHtml, setHeatmapHtml] = useState<string>("");
  const [clustersHtml, setClustersHtml] = useState<string>("");
  const [isDataLoaded, setIsDataLoaded] = useState<boolean>(false);

  const cities = ["Chicago", "Los Angeles", "New York", "San Francisco"];

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch("/datasets/crime_data.csv");
        if (!response.ok) {
          throw new Error(`Failed to fetch data: ${response.statusText}`);
        }
        const text = await response.text();
        const parsed = Papa.parse<DataRow>(text, { header: true, dynamicTyping: true });
        const processed = parsed.data
          .filter(
            (row) =>
              row.Description && row.Latitude && row.Longitude && row.Time && row.City
          )
          .map((row) => {
            if (typeof row.Time === "string" && row.Time.includes(" ")) {
              row.Time = row.Time.split(" ")[1];
            }
            const primSeverityMap: Record<string, number> = {
              "NON - CRIMINAL": 0,
              "NON-CRIMINAL (SUBJECT SPECIFIED)": 0,
              "NON-CRIMINAL": 0,
              "INTIMIDATION": 1,
              "OBSCENITY": 1,
              "OTHER OFFENSE": 1,
              "PUBLIC INDECENCY": 1,
              "LIQUOR LAW VIOLATION": 2,
              "PUBLIC PEACE VIOLATION": 2,
              "CONCEALED CARRY LICENSE VIOLATION": 2,
              "PROSTITUTION": 3,
              "GAMBLING": 3,
              "INTERFERENCE WITH PUBLIC OFFICER": 3,
              "STALKING": 3,
              "ARSON": 6,
              "BURGLARY": 5,
              "BATTERY": 2,
              "ROBBERY": 5,
              "SEX OFFENSE": 5,
              "ASSAULT": 3,
              "THEFT": 4,
              "DECEPTIVE PRACTICE": 5,
              "CRIMINAL TRESPASS": 4,
              "CRIMINAL DAMAGE": 4,
              "WEAPONS VIOLATION": 5,
              "MOTOR VEHICLE THEFT": 5,
              "OFFENSE INVOLVING CHILDREN": 5,
              "KIDNAPPING": 5,
              "NARCOTICS": 5,
              "OTHER NARCOTIC VIOLATION": 4,
              "HUMAN TRAFFICKING": 6,
              "CRIM SEXUAL ASSAULT": 6,
              "HOMICIDE": 6,
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
    }
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
      const cityData = data.filter((row) => row.City === city);
      console.log(`Data for ${city}:`, cityData.length, "rows");
      if (cityData.length === 0) {
        throw new Error(`No data available for ${city}`);
      }
      const filteredData = cityData.filter((row) => {
        const [h, m, s] = row.Time.split(":").map(Number);
        const timeOnly = new Date(1900, 0, 1, h, m, s);
        const startTimeObj = new Date(`1900-01-01T${startTime}`);
        const endTimeObj = new Date(`1900-01-01T${endTime}`);
        if (startTimeObj < endTimeObj) {
          return timeOnly >= startTimeObj && timeOnly < endTimeObj;
        } else {
          return timeOnly >= startTimeObj || timeOnly < endTimeObj;
        }
      });
      console.log("Filtered data count:", filteredData.length);
      if (filteredData.length === 0) {
        throw new Error(`No data available for the selected time range in ${city}`);
      }
      const heatmapContent = genHeatMapHTML(filteredData);
      const clustersContent = await genClustersHTML(filteredData, n);
      setHeatmapHtml(heatmapContent);
      setClustersHtml(clustersContent);
    } catch (err) {
      console.error("Error generating visualization:", err);
      setError(err instanceof Error ? err.message : "An unknown error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-screen" style={{ backgroundColor: "#ffffff", color: "#000000" }}>
      <div className="lg:w-1/4 p-6 bg-white overflow-auto text-black">
        <h1 className="text-3xl mb-1 font-lemon-milk">Project Nikolaj</h1>
        <p className="text-sm mb-10">Police Patrol Route Optimization System</p>
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            <strong>Error:</strong> {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block mb-2">
              Select City:
              <select value={city} onChange={(e) => setCity(e.target.value)} className="w-full p-2 border border-gray-300 rounded mt-1">
                {cities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
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
              Number of Patrol Routes:
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
            {loading ? "Generating..." : isDataLoaded ? "Generate Visualization" : "Loading Data..."}
          </button>
        </form>
      </div>
      <div className="lg:w-3/8 flex-1 flex flex-col">
        <div className="h-full border-l p-2">
          {heatmapHtml || clustersHtml ? (
            <CombinedVisualization heatmapHtml={heatmapHtml} clustersHtml={clustersHtml} />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-500">
              {loading ? "Generating visualization..." : "Click button to generate visualizations"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
