// app.js
// function to generate heatmaps.
function onclick1(){
    var d = document.getElementById("dept").value;
    var n=document.getElementById("police").value;
    var start=document.getElementById("fromtime").value;
    var end=document.getElementById("totime").value;

    start+=":00";
    end+=":00";

    var payload = {
                    "city_name" : d, // remember to change this to the variable later.
                    "n" : n,
                    "start" : start,
                    "end" : end
                }
    
    alert(d+" "+n+" "+start+" "+end, "info");
    fetch("http://localhost:8000/allocate/Heatmap", {
        method: "POST",
        headers:{
            'Content-Type': 'application/json'
            },
        body:JSON.stringify(payload)
        }
    )
    .then(response => response.text())
    .then(text => window.location.replace(text))
}

// slight variations for the zone plotting.
function onclick2(){
    var d = document.getElementById("dept").value
    var n=document.getElementById("police").value;
    var start=document.getElementById("fromtime").value;
    var end=document.getElementById("totime").value;

    start+=":00";
    end+=":00";

    var payload = {
                    "city_name" : d, // remember to change this to the variable later.
                    "n" : n,
                    "start" : start,
                    "end" : end
                }
    
    alert(d+" "+n+" "+start+" "+end, "info");
    fetch("http://localhost:8000/allocate/Patrol", {
        method: "POST",
        headers:{
            'Content-Type': 'application/json'
            },
        body:JSON.stringify(payload)
        }
    )
    .then(response => response.text())
    .then(text => window.location.replace(text))
}