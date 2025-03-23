# modularCluster.py
# this .py file is intended to be the module that can be inserted into any code and can be used to generate desired output.
import numpy as np
import pandas as pd
from sklearn.cluster import *
import datetime as dt
import plotly.express as px
from scipy.spatial import Delaunay
import warnings
warnings.filterwarnings("ignore")

def assign(city: str):
    global df 
    df = pd.read_csv('datasets/' + city + 'Set.csv')
    timelist = []
    for i in range(len(df)):
        datetime_object = dt.datetime.strptime(df['Time'][i][-8:], '%H:%M:%S')
        timelist.append(datetime_object)
    df['Time'] = timelist

    # for reference, the severity scale i used. based on some basic law articles i could find.
    # THIS FILE NEEDS TO BE EDITED IN ORDER TO WORK WITH ALL DATASETS
    primList = {'NON - CRIMINAL': 0, 'NON-CRIMINAL (SUBJECT SPECIFIED)': 0, 'NON-CRIMINAL': 0,
                'INTIMIDATION': 1, 'OBSCENITY': 1, 'OTHER OFFENSE': 1, 'PUBLIC INDECENCY': 1,
                'LIQUOR LAW VIOLATION': 2, 'PUBLIC PEACE VIOLATION': 2, 'CONCEALED CARRY LICENSE VIOLATION': 2,
                'PROSTITUTION': 3, 'GAMBLING': 3, 'INTERFERENCE WITH PUBLIC OFFICER': 3, 'STALKING': 3,
                'ARSON': 6, 'BURGLARY': 5, 'BATTERY': 2, 'ROBBERY': 5, 'SEX OFFENSE': 5, 'ASSAULT': 3,
                'THEFT': 4, 'DECEPTIVE PRACTICE': 5, 'CRIMINAL TRESPASS': 4, 'CRIMINAL DAMAGE': 4, 'WEAPONS VIOLATION' : 5,
                'MOTOR VEHICLE THEFT': 5, 'OFFENSE INVOLVING CHILDREN': 5, 'KIDNAPPING': 5, 'NARCOTICS': 5,
                'OTHER NARCOTIC VIOLATION' : 4,'HUMAN TRAFFICKING' : 6,'CRIM SEXUAL ASSAULT' : 6, 'HOMICIDE' : 6}
    # some code here idk lmao


    return df

def alpha_shape(points, alpha, only_outer=True):
    assert points.shape[0] > 3, "Need at least four points"
    def add_edge(edges, i, j):
        if (i, j) in edges or (j, i) in edges:
            assert (j, i) in edges, "Can't go twice over same directed edge right?"
            if only_outer:
                edges.remove((j, i))
            return
        edges.add((i, j))
    tri = Delaunay(points)
    edges = set()
    for ia, ib, ic in tri.vertices:
        pa = points[ia]
        pb = points[ib]
        pc = points[ic]
        a = np.sqrt((pa[0] - pb[0]) ** 2 + (pa[1] - pb[1]) ** 2)
        b = np.sqrt((pb[0] - pc[0]) ** 2 + (pb[1] - pc[1]) ** 2)
        c = np.sqrt((pc[0] - pa[0]) ** 2 + (pc[1] - pa[1]) ** 2)
        s = (a + b + c) / 2.0
        area = np.sqrt(s * (s - a) * (s - b) * (s - c))
        circum_r = a * b * c / (4.0 * area)
        if circum_r < alpha:
            add_edge(edges, ia, ib)
            add_edge(edges, ib, ic)
            add_edge(edges, ic, ia)
    return edges

# Generates a figure heatmap, which is in javascript. We won't be using this in our backend.
def genHeatMap(df):
    fig = px.density_mapbox(df, lat='Latitude', lon='Longitude', z='type',
                        mapbox_style="stamen-terrain", radius=3)
    fig.update_layout(margin ={'l':15,'t':5,'b':5,'r':15})
    return fig

def timeFilter(df: pd.DataFrame, start: str, end: str) -> pd.DataFrame:
    start = dt.datetime.strptime(start, '%H:%M:%S')
    end = dt.datetime.strptime(end, '%H:%M:%S')
    if (start < end):
        return df.loc[(df['Time'] >= start) & (df['Time'] < end)]
    else:
        return df.loc[(df['Time'] >= start) | (df['Time'] < end)]


def analyze(tdf: pd.DataFrame, nCluster: int):
    model = KMeans(n_clusters=nCluster)
    results = model.fit_predict(tdf.loc(axis=1)['Latitude':'Longitude'])
    tdf['cluster'] = results
    Hcenters = []
    Pedges = []
    for i in range(len(set(results))):
        fildf = tdf[tdf['cluster'] == i]
        nmod = KMeans(int(np.power(len(fildf), 0.25)))
        nmod.fit([[i, j] for i, j in zip(fildf['Longitude'], fildf['Latitude'])])
        centers = nmod.cluster_centers_
        try:
            edges = alpha_shape(centers, 1)
            Hcenters.append(centers)
            Pedges.append(edges)
        except:
            continue
    
    longs = []
    lats = []
    for i in range(len(Hcenters)):
        tempcen = Hcenters[i]
        for j, k in Pedges[i]:
            x = tempcen[[j, k], 0]
            y = tempcen[[j, k], 1]
            longs.append(x.tolist())
            lats.append(y.tolist())
    return longs, lats

# test case for debug, runtime is still high.
if __name__ == '__main__':
    city = "Los Angeles"
    start = '08:45:00'
    end = '17:35:00'
    n = 85
    df = assign(city)
    naal, naam = analyze(df, n)
    print(naal)