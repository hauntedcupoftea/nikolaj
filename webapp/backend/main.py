from fastapi import FastAPI
import plotly.express as px
import plotly.graph_objects as go
import numpy as np
from modularCluster import *
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(debug=True)

origins = [
    "http://localhost",
    "http://localhost:8000"
    "http://localhost:8080",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get('/')
def read_root():
    return {"result" : "Successfully connnected to nikolaj's API."}

@app.get('/allocate/{type_gen}')
def generate_figure(type_gen: str, city_name:str, n: int, start: str, end: str):
    # filter the dataframe by time, regardless of what method is chosen.
    df = assign(city_name)
    timedf = timeFilter(df, start, end)
    # if the type is a heatmap, generate and save a heatmap.html, 
    # manya will then just boot up that file in a new tab and it'll work.
    if type_gen == "Heatmap":
        hm = genHeatMap(timedf)
        hm.write_html('webapp/frontend/heatmap.html')
        return {'status' : 'done'} # manya's code needs to wait for this message
    
    # almost the same as heatmap, but with more monkey code required to make it work.
    elif type_gen == "Routes":
        longs, lats = analyze(timedf, n)
        fig = go.Figure(go.Scattermapbox(
            mode = "markers+lines"))

        for i in range(len(lats)):
            fig.add_trace(go.Scattermapbox(
                mode = "markers+lines",
                lon = longs[i],
                lat = lats[i],
                marker = {'size': 10, 'color' : 'blue'}))

        fig.update_layout(
            margin ={'l':15,'t':5,'b':5,'r':15},
            mapbox = {
                'center': {'lon': np.average(longs), 'lat': np.average(lats)},
                'style': "stamen-terrain",
                'center': {'lon': np.average(longs), 'lat': np.average(lats)},
                'zoom': 11.2},
            showlegend=False)
        # write the html file.
        fig.write_html("webapp/frontend/graph.html")

        return {'status' : 'done'} # manya's code needs to wait for this message


# @app.websocket('/')