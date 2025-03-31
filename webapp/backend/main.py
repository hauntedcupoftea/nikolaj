# main.py
# WARNING: THIS IS A VERY SLOPPY IMPLEMENTATION.
# The absolute barebones we could do, not knowing any actual web development.
from http.client import HTTPException
from fastapi import FastAPI, Body
import plotly.graph_objects as go
import numpy as np
from webapp.backend.modularCluster import *
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

app = FastAPI(debug=True)

origins = [
    "http://localhost",
    "http://127.0.0.1",
    "http://localhost:8000"
    "http://localhost:8080",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# class InfoBody(BaseModel):
#     city_name: str
#     n: int
#     start: str
#     end: str

@app.get('/')
def read_root():
    return {"result" : "Successfully connnected to nikolaj's API."}

@app.post('/allocate/{type_gen}')
def generate_figure(type_gen: str, payloadbody: dict = Body(...)):
    # align payloadbody items with my variables.
    # payloadbody = payloadbody.json()
    city_name = payloadbody["city_name"]
    n = int(payloadbody["n"])
    start = payloadbody["start"]
    end = payloadbody["end"]
    # filter the dataframe by time, regardless of what method is chosen.
    df = assign(city_name)
    timedf = timeFilter(df, start, end)
    # if the type is a heatmap, generate and save a heatmap.html, 
    # manya will then just boot up that file in a new tab and it'll work.
    if type_gen == "Heatmap":
        hm = genHeatMap(timedf)
        hm.write_html('webapp/frontend/heatmap.html')
        return PlainTextResponse("http://localhost:8080/heatmap.html", 200)
        # return {'status' : 'done'}
    
    # almost the same as heatmap, but with more monkey code required to make it work.
    elif type_gen == "Patrol":
        longs, lats = analyze(timedf, n)
        fig = go.Figure(go.Scattermapbox(
            mode = "markers+lines"))

        for i in range(len(lats)):
            fig.add_trace(go.Scattermapbox(
                mode = "markers+lines",
                lon = longs[i],
                lat = lats[i],
                marker = {'size': 6, 'color' : 'blue'}))

        fig.update_layout(
            margin ={'l':15,'t':5,'b':5,'r':15},
            mapbox = {
                'center': {'lon': np.average(longs), 'lat': np.average(lats)},
                'style': "stamen-terrain",
                'center': {'lon': np.average(longs), 'lat': np.average(lats)},
                'zoom': 10},
            showlegend=False)
        # write the html file.
        fig.write_html("webapp/frontend/graph.html")

        return PlainTextResponse("http://localhost:8080/graph.html", 200) # redirect to the file hosted in my 
                                                                         # python http server at port 8080

@app.options('/allocate/{type_gen}')
def optionslmao():
    return

@app.options("/allocate/{type_gen}", status_code=200) 
def users_options(): 
    try: 
        return PlainTextResponse("OK", status_code=200)
    except: 
        raise HTTPException(status_code=404, detail="Not found")

# Run these functions in a terminal.
# $ python -m http.server --directory "webapp/frontend" 8080
# $ uvicorn webapp.backend.main:app
# @app.websocket('/')