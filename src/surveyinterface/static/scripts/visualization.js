/**
 * Created by Juan on 4/6/14.
 */

if (typeof Array.prototype.getUnique != 'function') {
    Array.prototype.getUnique = function(){
       var u = {}, a = [];
       for(var i = 0, l = this.length; i < l; ++i){
          if(u.hasOwnProperty(this[i])) {
             continue;
          }
          a.push(this[i]);
          u[this[i]] = 1;
       }
       return a;
    }
}

if (typeof String.prototype.startsWith != 'function') {
  String.prototype.startsWith = function (str){
    return this.indexOf(str) == 0;
  };
}

define('visualization', ['bootstrap', 'd3Libraries', 'mapLibraries', 'underscore'],  function() {
    var self = {};
    var data, metadata, selectedQuestion, svg, radius_scale, nodes, force;
    var radius = 10;
    var yAxisMode = "All";
    var margin = {top:0, bottom:60, left:0, right:5};
    var w = $("#visualizationContent").width() - 20, h = $("#visualizationContent").height() - $("#top-bar").height() - 20 /*- $("#top-bar").height()*/;
    var view = "";
    var answers = [];
    var options = [];
    var tableColor = "#666";
    var legendColor = "#000";
    var yPanelWidth = 40;
    var map;
    var markers = [];
    var nodes = [];
    var markerQuestions = [];
    var openInfoWindow = {};
    var numberOfQuestions = 0;
    var questionNodes = [];

    d3.selection.prototype.moveToBack = function() {
        return this.each(function() {
            var firstChild = this.parentNode.firstChild;
            if (firstChild) {
                this.parentNode.insertBefore(this, firstChild);
            }
        });
    };

    d3.selection.prototype.moveToFront = function() {
      return this.each(function(){
        this.parentNode.appendChild(this);
      });
    };

    // Multiple choices (s:select one, m:select multiple) - Single choice group - Single choice
    var regExp = {reMS: /^Q([0-9]+)E_([0-9]+)/,  reS:/^Q([0-9])+E/};
    var infoQuestions = {Gender:"Q12E", OriginallyFromUtah: "Q8E", SurveyVenue:"VX", Site:"Q15E", FarmTies: "Q11E", Education:"Q14E", Age:"Q13E"}

    self.loadData = function() {
        $.ajax(self.dataFile, {
            success: function(csvData) {
                data = csvjson.csv2json(csvData);
                    $.ajax(self.metadataFile, {
                        success: function(csvMetaData) {
                            metadata = csvjson.csv2json(csvMetaData);
                            self.drawPivotView();
                        },
                        error: function() {
                            console.log("Failed to load metadata csv file");
                        }
                    });
            },
            error: function() {
                console.log("Failed to load data csv file");
            }
        });
    };

    self.drawPivotView = function() {
        loadQuestions();
        initializeGraph();
    };

    // Returns the cell value given a question ID and the name of the column
    function getValue(questionID, label){
        for (var i = 0; i < metadata.rows.length; i++){
            if (metadata.rows[i]["ID"] == questionID){
                for (var prop in metadata.rows[i]){
                    if (metadata.rows[i][prop] == label){
                        return prop;
                    }
                }
                return 0;
            }
        }
    }

    // Returns the column name in the metadata file given the question id and a value
    function getLabel(questionID, value){
        for (var i = 0; i < metadata.rows.length; i++){
            if (metadata.rows[i]["ID"] == questionID){
                return metadata.rows[i][value] == null ? "No response" : metadata.rows[i][value];
            }
        }
    }

    function initializeGraph(){
        radius_scale = d3.scale.pow().exponent(0.5).domain([0, data.rows.length - 1]).range([2, 85]);
        nodes = d3.range(data.rows.length - 1).map(function(d, i) {
            var OriginallyFromUtah =      getLabel(infoQuestions.OriginallyFromUtah, data.rows[i + 1][infoQuestions.OriginallyFromUtah]);
            var Gender =        getLabel(infoQuestions.Gender, data.rows[i + 1][infoQuestions.Gender]);
            var Education =     getLabel(infoQuestions.Education, data.rows[i + 1][infoQuestions.Education]);
            var Age =           getLabel(infoQuestions.Age, data.rows[i + 1][infoQuestions.Age]);
            var FarmTies =      getLabel(infoQuestions.FarmTies, data.rows[i + 1][infoQuestions.FarmTies]);
            var SurveyVenue = data.rows[i + 1][infoQuestions.SurveyVenue];
            var Site = data.rows[i + 1][infoQuestions.Site];
            var info = {OriginallyFromUtah: OriginallyFromUtah, SurveyVenue:SurveyVenue, Site:Site, FarmTies:FarmTies, Gender: Gender, Education: Education, Age: Age};

            return {radius: radius, value: 0, info: info, temp:false, tempPosY:0, cx: w/2, cy: (h - margin.bottom) / 2};
        });

        svg = d3.select("#visualizationContent").append("svg:svg")
            .attr("width", w)
            .attr("height", h);

        drawTable();
        setPercentageView();

        // Pre-load markers for questions that use the map
        for (var i = 0; i < markerQuestions.length; i++){
            loadMarkerData(markerQuestions[i]);
        }
        //loadMarkerData(question);

        $("#percentageview").click(setPercentageView);
        $("#nodeview").click(setMapView);

        $('#listQuestions .clickable').click(onListQuestionClick);
        $('#listQuestions li').click(onListQuestionClick);
        $('#lstYAxisMode li:not(.disabled)').click(onYAxisModeChange);
        $("#lstYAxisMode li:first-child").addClass("disabled"); // Start with the selected category disabled
        $(".btnAdd").click(onBtnAddClick);
    }


    function initializeMap() {
        if (map != null){
            return;
        }
        var mapOptions = {
            center: new google.maps.LatLng(38.5000, -98.0000),   // Center the map at Utah
            zoom: 5
        };

        map = new google.maps.Map(document.getElementById('map-canvas'),
            mapOptions);
    }

    function loadMarkerData(mapQuestion){
        var values = [];
        // populate value arrays
        for (var i = 0; i < nodes.length; i++){
            var myVal = data.rows[i + 1][mapQuestion];
            if (myVal == 0 || nodes[i].info[yAxisMode] == "No response" || nodes[i].info[yAxisMode] == 0){
                continue;
            }
            values.push(myVal);
        }

        values = _(values).countBy();
        var counter = 0;

        _(values).keys().forEach(function(zipcode) {
            var dataMarker;

            if (localStorage[zipcode] != null){
                dataMarker = JSON.parse(localStorage[zipcode]);
            }
            // Request the marker data from geocode API which has a limit of 1 request per ~300 ms
            if (dataMarker == null){
                setTimeout(function() {
                    var url = 'http://maps.googleapis.com/maps/api/geocode/json?address=' + zipcode;
                    $.getJSON(url, function(data) {
                        if (data.results.length === 0) {
                            return;
                        }
                        var result = _(data.results).first();
                        var title = _(result.address_components).pluck("long_name").join(', ');
                        var position = result.geometry.location;

                        localStorage.setItem(zipcode, JSON.stringify({title:title, position:position}));    // Save in local storage for future use
                    });
                }, 300 * counter++);
            }
        });
    }

    function loadMarkers(values){
        var counter = 0;

        _(values).keys().forEach(function(zipcode) {
            var dataMarker;

            if (localStorage[zipcode] != null){
                dataMarker = JSON.parse(localStorage[zipcode]);
            }
                                                                                                            // If the marker exists in the local storage, load it from there
            if (dataMarker != null){
                addMarker(dataMarker.title, values[zipcode], dataMarker.position);
            }else{                                                                                          // Request it from geocode API which has a limit of 1 request per ~300 ms
                setTimeout(function() {
                    var url = 'http://maps.googleapis.com/maps/api/geocode/json?address=' + zipcode;
                    $.getJSON(url, function(data) {
                        if (data.results.length === 0) {
                            return;
                        }
                        var result = _(data.results).first();
                        var title = _(result.address_components).pluck("long_name").join(', ');
                        var position = result.geometry.location;
                        localStorage.setItem(zipcode, JSON.stringify({title:title, position:position}));    // Save in local storage for future use
                        addMarker(title, values[zipcode], position);
                    });
                }, 300 * counter++);
            }
        });
    }

    function addMarker(title, participants, position){
        var infoWindowContent = "<section style='text-align: left;'>\
                                    <header><h5>" + "<b>Location: </b>" + title + "</h5></header>\
                                    <h5>" + "<b>Participants: </b>"+ participants + "</h5></header>\
                                </section>";

        var infoWindow = new google.maps.InfoWindow({
            content: infoWindowContent
        });

        var marker = new google.maps.Marker({
            title: title + ". \n" + participants + ((participants > 1) ?" participants" : " participant"),
            position: position,
            map: map
        });

        google.maps.event.addListener(marker, 'click', function() {
            if (openInfoWindow.hasOwnProperty("content")) {
                openInfoWindow.close();
            }
            infoWindow.open(map, marker);
            openInfoWindow = infoWindow;
        });

        markers.push(marker);
    }

    function clearMarkers(){
        for (var i = 0; i < markers.length; i++) {
            markers[i].setMap(null);
        }
    }

    function loadMap(){
        $("#map-canvas").show();
        // Initialize google maps
        //google.maps.event.addDomListener(window, 'load', initializeMap);
        initializeMap();

        var values = [];
        // populate value arrays
        for (var i = 0; i < nodes.length; i++){
            nodes[i].value = data.rows[i + 1][selectedQuestion];
            if (nodes[i].value == 0 || nodes[i].info[yAxisMode] == "No response" || nodes[i].info[yAxisMode] == 0){
                continue;
            }
            values.push(nodes[i].value);
        }

        values = _(values).countBy();

        clearMarkers();
        loadMarkers(values);
    }

    function onListQuestionClick(e){
        var that = $(e.target).closest(".clickable").length > 0 ? $(e.target).closest(".clickable") :$(e.target).find(".clickable");

        // Prevents the event from triggering twice with the same question
        if(that.length == 0 || that[0].getAttribute("data-value") == selectedQuestion){
            return;
        }

        if (that.length == 0){
            return;
        }

        $("#btnCategories").disabled=false;
        numberOfQuestions = 1;
        $('#listQuestions li').removeClass("active");
        that.closest("li").addClass("active");
        selectedQuestion = that.attr("data-value");

        var title = data.rows[0][selectedQuestion].substr(0, data.rows[0][selectedQuestion].lastIndexOf('-'));
        var content;
        if (data.rows[0][selectedQuestion].lastIndexOf('-') != -1){
            content = data.rows[0][selectedQuestion].substr(data.rows[0][selectedQuestion].lastIndexOf('-') + 1, data.rows[0][selectedQuestion].length);
        }
        else{
            content = data.rows[0][selectedQuestion];
        }

        // Toggle add button visibility
        $(".btnAdd").hide();
        removeTempNodes();

        if ($(this.parentElement).hasClass("indented")){
            $(this.parentElement.parentElement).find(".btnAdd").show();
             $(this.parentElement).find(".btnAdd").hide();

        }
        else{
             $(".btnAdd").hide();
        }

        // Toggle Title visibility
        $("#txtDescription").text("");
        $("#txtTitle").text(title);
        if ($("#txtTitle").text() == ""){
            $(".titleContainer").hide();
        }
        else{
            $(".titleContainer").show();
        }
        $("#txtDescription").text(" " + content);
        if ($("#txtDescription").text() == ""){
            $(".descriptionContainer").hide();
        }
        else{
            $(".descriptionContainer").show();
        }

        if (getLabel(selectedQuestion, "data-type") == "map"){
            loadMap();
            return;
        }
        else{
            $("#map-canvas").hide();
        }

        drawTable();

        if (view == "percentage"){
            svg.selectAll("circle").remove();
            svg.selectAll(".node").transition().duration(550).remove();
            svg.selectAll(".fixedNode").transition().duration(550).remove();
            svg.selectAll(".fixedNode text").remove();
            addFixedNodes();
        }
        else{
            setMapView();
        }

        if (yAxisMode == "" && numberOfQuestions < 2){
            yAxisMode = "All";
        }
    }




    function onBtnAddClick(e){
        $(this).closest("li").addClass("active");
        $(this).hide();

        yAxisMode = "";
        numberOfQuestions = $(this).parent().parent().find(".active").length;

        // Load labels for y-axis
        var labels = $(this).parent().parent().find(".active .clickable");
        for (var i = 0; i < labels.length; i++){
            labels[i] = $(labels[i]).text();
        }

        if (svg != null){
            svg.selectAll(".x-legend").remove();
            svg.selectAll(".y-legend").remove();
            svg.selectAll("rect").remove();
            svg.selectAll("line").remove();
            svg.selectAll("rect").remove();
            svg.selectAll(".yPanelLabel").remove();
            //svg.selectAll(".countLabel").remove();
        }

        var options = _.range(numberOfQuestions);

        // Draw y-axis legend
        for (var i = 0; i < numberOfQuestions; i++){
            svg.append("text")
              .attr("class", "y-legend")
              .attr("data-id", i)
              .attr("id", "y-legend" + i)
              .attr("font-weight", "normal")
              .attr("fill", legendColor)
              .attr("dx", 0)
              .attr("dy", 0)
              .attr("text-anchor", "start")
              .attr("y", ((h - margin.bottom) / (numberOfQuestions)) * i + 30)
              .attr("transform", "translate(" + (yPanelWidth + 10) + "," + margin.top + ")")
              .text(function(){return labels[i];})
              .call(wrap, 150);
        }
        var marginLeft = getYLabelSize() + yPanelWidth;

        var x = d3.scale.linear()
            .domain([0, answers.length])
            .range([0, w - marginLeft]);

        var y = d3.scale.linear()
            .domain([0, options.length])
            .range([0, h - margin.bottom - margin.top]);

        // Draw stuff
        drawOuterRect();

        //drawXAxisLegend(marginLeft, x);

        drawVerticalLines(marginLeft, x);
        drawHorizontalLines(y, marginLeft);

        drawLegendContainers(marginLeft);

        drawColorGradient(marginLeft, x);

        drawYAxisPanel();

        drawXAxisLegend(marginLeft, x);
        // Add a set of nodes for each selected question
        removeTempNodes();
        var nodesCopy = nodes.slice();
        var tempQuestions = $(this).parent().parent().find(".active .clickable");

        // Get list of selected questions
        for (var i = 0; i < labels.length; i++){
            tempQuestions[i] = tempQuestions[i].getAttribute("data-value");
        }

        questionNodes = [];

        for (var j = 0; j < tempQuestions.length; j++){ // -1 because the first set of nodes is already the original set
            questionNodes[j] = [];
            for (var i = 0; i < nodesCopy.length; i++){
                var tempNode = {
                    radius: radius,
                    value: data.rows[i + 1][tempQuestions[j]],
                    info:nodesCopy[i].info,
                    temp:true,
                    tempPosY:j,
                    cx: w/2,
                    cy: (h - margin.bottom) / 2
                }
                questionNodes[j].push(tempNode);
            }
        }
        // Move each set of nodes
        if (view == "map"){

        }
        else{

            svg.selectAll(".fixedNode").remove();
            svg.selectAll(".countLabel").remove();
            svg.selectAll("circle").transition().duration(500).attr("r", 1e-6).remove();
            addFixedNodes();
        }

        $("#btnCategories").disabled=true;
    }

     function removeTempNodes(){
        questionNodes = [];
    }

    function onYAxisModeChange(e){
        if (e.target.getAttribute("data-axis") == yAxisMode){
            return;
        }
        $("#lstYAxisMode li").removeClass("disabled");
        $(this).addClass("disabled");
        yAxisMode = e.target.getAttribute("data-axis");
        // $("#btnCategories").text(yAxisMode);
        drawTable();

        if (view == "map"){


        }
        else{
            svg.selectAll("circle").remove();
            svg.selectAll(".node").transition().duration(550).remove();
            svg.selectAll(".fixedNode").transition().duration(550).remove();
            svg.selectAll(".fixedNode text").remove();
            svg.selectAll(".countLabel").remove();
            addFixedNodes();
        }
    }


    function setMapView(){

    }

    function setPercentageView(){
        if (view == "percentage")
            return;

        view = "percentage";

        $("#percentage-view").addClass("disabled");
        $("#map-view").removeClass("disabled");

        svg.selectAll(".countLabel").remove();
        svg.selectAll("circle").transition().duration(500).attr("r", 1e-6).remove();

        addFixedNodes();
    }

    function setMapView(){
        if (view == "node" && yAxisMode != "")
            return;
        view = "map";

        $("#map-view").addClass("disabled");
        $("#percentage-view").removeClass("disabled");

    }

    function refreshValues(){
        // Add fixed nodes
        var valuesY = [];
        var valuesX = [];

        if (questionNodes.length < 2){
            for (var i = 0; i < data.rows.length - 1; i++){
                nodes[i].value = data.rows[i + 1][selectedQuestion];
                if (nodes[i].value == 0 || nodes[i].info[yAxisMode] == "No response" || nodes[i].info[yAxisMode] == 0){
                    continue;
                }
                valuesX.push(nodes[i].value);
                valuesY.push(data.rows[i + 1][infoQuestions[yAxisMode]]);
            }
            options = valuesY.getUnique().sort(function(a, b){return b-a});
        }
        else{
            // Add data when multiple questions are selected
            for (var j = 0; j < questionNodes.length; j++){
                for (var i = 0; i < data.rows.length - 1; i++){
                    if (questionNodes[j][i].value == 0 || questionNodes[j][i].info[yAxisMode] == "No response" || questionNodes[j][i].info[yAxisMode] == 0){
                        continue;
                    }
                    valuesX.push(questionNodes[j][i].value);

                }
            }
            options = _.range(numberOfQuestions);
        }

        answers = valuesX.getUnique().sort(function(a, b){return a-b});
    }

    function addFixedNodes(){
        // Add fixed nodes
        refreshValues();


        var marginLeft = getYLabelSize() + yPanelWidth;

        var fixedNodes = d3.range(answers.length * options.length).map(function(i) {
          return {
                  radius: 0,
                  fixed:true,
                  amount:0,
                  x: (i % answers.length) * ((w - marginLeft) / answers.length) + ((w - marginLeft)/(answers.length * 2)) + marginLeft,
                  y: margin.top + Math.floor(i / answers.length) * ((h - margin.bottom - margin.top) / options.length) + ((h - margin.bottom - margin.top)/(options.length * 2)),
                  pos: {x:(i % answers.length), y:Math.floor(i / answers.length)}};
        });

        // Replace each value for its label, except for text input questions
        if (getLabel(infoQuestions[yAxisMode], 1) != "(text)"){
            for (var i = 0; i < options.length; i++){
                options[i] = getLabel(infoQuestions[yAxisMode], options[i]);
            }
        }

        if (questionNodes < 2){
            nodes.forEach(function(d) {
                var posAnswer = ($.inArray(d.value, answers));
                var posOption = ($.inArray(d.info[yAxisMode], options));
                if (yAxisMode == ""){
                    posOption = d.tempPosY;
                }

               fixedNodes.forEach(function(o){
                   if (o.pos.x == posAnswer && o.pos.y == posOption){
                       o.amount += 1;
                   }
               })
            });
        }
        else{
            for (var i = 0; i < questionNodes.length; i++){
                for (var j = 0; j < questionNodes[i].length; j++){
                    var node = questionNodes[i][j];
                    var posAnswer = ($.inArray(node.value, answers));
                    var posOption = ($.inArray(node.info[yAxisMode], options));
                    if (yAxisMode == ""){
                        posOption = node.tempPosY;
                    }

                   fixedNodes.forEach(function(o){
                       if (o.pos.x == posAnswer && o.pos.y == posOption){
                           o.amount += 1;
                       }
                   })
                }
            }
        }



        var fixedNodesContainers = svg.selectAll().data(fixedNodes).enter().append("svg:g")
            .attr("class", "fixedNode")
            .attr("fill", "#FFF")
            .attr("stroke-width", "3")
            .on("mouseover", function(d){
                d3.select(this).attr("stroke-width", "5");
            })
            .on("mouseout", function(){
                d3.select(this).attr("stroke-width", "3");
            })

        fixedNodesContainers.append("svg:circle")
            /*.style("stroke", function(d, i){
                var myColor = d3.scale.category10().range();
                var index = options.length - Math.floor(i / answers.length);
                return myColor[index];
            })*/
            .style("stroke", "#AAA")
            .attr("r", "15")
            .attr("visibility", function(d){
                if (d.amount == 0){
                    return "hidden";
                }
                return "visible";
            })
            .transition().duration(700).attr("r", function(d) {
                var rowTotal = 0;
                fixedNodes.forEach(function(o){
                   if (o.y == d.y){
                       rowTotal += o.amount;
                   }
                });
                var x = d3.scale.linear()
                    .domain([0, answers.length])
                    .range([0, w - marginLeft]);
                var y = d3.scale.linear()
                    .domain([0, options.length])
                    .range([0, h - margin.bottom - margin.top]);
                var maxRadius = (Math.min(x(1) - x(0), y(1) - y(0))) / 2 - 10;

                var customScale = d3.scale.pow().exponent(0.5).domain([0, rowTotal]).range([2, maxRadius]);
                return customScale(d.amount);
            })
            .attr("opacity", 0.6);

        fixedNodesContainers.append("svg:text")
          .attr("x", function(d) {
                return d.x;
           })
          .attr("y", function(d) {
                return d.y;
          })
          .attr("visibility", function(d){
                if (d.amount == 0){
                    return "hidden";
                }
                return "visible";
          })
          .attr("dy", ".31em")
          //.style("text-decoration", "underline")
          .style("fill", "#000")
          .text(0).transition().duration(700).tween("text", function(d) {
                var rowTotal = 0;   // Percentage is calculated per row
                fixedNodes.forEach(function(o){
                   if (o.y == d.y){
                       rowTotal += o.amount;
                   }
                });
                var i = d3.interpolate(this.textContent, (100/ rowTotal) * d.amount),
                    prec = (d.amount + "").split("."),
                    round = (prec.length > 1) ? Math.pow(10, prec[1].length) : 1;

                var x = parseFloat(this.getAttribute("x"));
                var y = parseFloat(this.getAttribute("y"));

                return function(t) {
                    var value = (i(t) * round / round).toFixed(2);
                    this.textContent = value + "%";
                    // Center the label
                    var textWidth = d3.select(this).node().getBBox().width;
                    this.setAttribute("x" , x - textWidth / 2);

                    // Label starts outside the circle since the circle is too small at the beginning
                    if (parseFloat(this.getAttribute("y")) == y){
                        this.setAttribute("y" , y + yPanelWidth);
                    }

                    // Once the circle is large enough, move the label to the center
                    //if (value > 12 && parseFloat(this.getAttribute("y")) != y){
                        this.setAttribute("y" , y);
                    //}
                };
          });

        svg.selectAll("circle").attr("transform", transform);
    }

    function drawOuterRect(){
       //var marginLeft = yAxisMode != "All" ? margin.left : 0;
       svg.append("svg:rect")
        .attr("width", w)
        .attr("height", h - margin.top)
        .attr("transform", "translate(" + 0 + "," + margin.top + ")")
        .style("stroke", tableColor)
        .style("stroke-width", "2px")
        .style("border-radius", "4px")
        .style("fill", "none");
    }

    function drawXAxisLegend(marginLeft, x){
        var value = $(".active label").attr("data-value");
        var delta = (x(1) - x(0));
        for (var i = 0; i < answers.length; i++){
           svg.append("text")
              .attr("dx", 0)
              .attr("dy", 0)
              .attr("class", "x-legend")
              .attr("text-anchor", "middle")
              .attr("font-weight", "normal")
              .attr("fill", legendColor)
              .attr("y", h - margin.bottom + 30)
              .attr("id", "x-legend" + i)
              .attr("transform", "translate(" + ( x(i) + marginLeft + delta/2) + "," + 0 + ")")
              .attr("data-id", i)
              .text(function(){
                   for (var j = 0; j < metadata.rows.length; j++){
                       var reGetQuestionID = /^[a-z|A-Z|0-9|_]*/;
                       var questionID = reGetQuestionID.exec(metadata.rows[j]["ID"])[0];
                       if (questionID == value){
                           if (metadata.rows[j][answers[i]] == null){
                               return "No response";
                           }
                           return metadata.rows[j][answers[i]] == "0" ? " " : metadata.rows[j][answers[i]];
                       }
                   }
                   if (data.rows[0][value] != null)
                        return data.rows[0][value] + ": " + answers[i];
                   else
                        return "";
              })
              .call(wrap, delta);
        }
    }

    function drawYAxisLegend(){
        for (var i = 0; i < options.length; i++){
            svg.append("text")
              .attr("class", "y-legend")
              .attr("data-id", i)
              .attr("id", "y-legend" + i)
              .attr("font-weight", "normal")
              .attr("fill", legendColor)
              .attr("dx", 0)
              .attr("dy", 0)
              .attr("text-anchor", "start")
              .attr("y", ((h - margin.bottom) / (options.length)) * i + 30)
              .attr("transform", "translate(" + (yPanelWidth + 10) + "," + margin.top + ")")
              .text(function(d){
                   if (yAxisMode == 'All')
                       return "";
                   // case for non standard formatted question
                   if (getLabel(infoQuestions[yAxisMode], 1) == "(text)"){
                        return options[i];
                   }
                   for (var j = 0; j < metadata.rows.length; j++){
                       var reGetQuestionID = /^[a-z|A-Z|0-9|_]*/;
                       var questionID = reGetQuestionID.exec(metadata.rows[j]["ID"])[0];
                       if (questionID == infoQuestions[yAxisMode]){
                           if (metadata.rows[j][options[i]] == null){
                               return "No response";
                           }
                           return metadata.rows[j][options[i]] == "0" ? " " : metadata.rows[j][options[i]];
                       }
                   }
                   return options[i];
              })
              .call(wrap, 150);
        }
    }

    function drawHorizontalLines(y){
        for (var i = 1; i <= options.length; i++){
            svg.append("svg:line")
                .attr("x1", yPanelWidth)
                .attr("x2", w)
                .attr("y1", y(i))
                .attr("y2", y(i))
                //.attr("id", "line" + i)
                .attr("data-id", i)
                .attr("class", "horizontal-line")
                .attr("transform", "translate(" + 0 + "," + margin.top + ")")
                .style("stroke", tableColor)
                .style("stroke-width", "1.3px")
        }

        // Line at the top of x axis legend
        svg.append("svg:line")
            .attr("x1", 0)
            .attr("x2", w)
            .attr("y1", h - margin.bottom)
            .attr("y2", h- margin.bottom)
            .attr("class", "horizontal-line")
            .style("stroke", tableColor)
            .style("stroke-width", "1.3px")

        // Gray alternation
        for (var i = 0; i <= options.length - 1; i++){
           var grad = svg.append("svg:rect")
            .attr("width", w)
            .attr("height", y(1) - y(0))
            .attr("transform", "translate(" + yPanelWidth + "," + y(i) + ")")
            .attr("opacity", (i%2 == 0) ? 0 : 0.1)
            .style("fill", "#000");

            grad.moveToBack();
        }
    }

    function drawVerticalLines(marginLeft, x){
        for (var i = 1; i < answers.length; i++){
            svg.append("svg:line")
                .attr("x1", x(i) + marginLeft)
                .attr("x2", x(i) + marginLeft)
                .attr("y1", margin.top)
                .attr("y2", h)
                .attr("class", "vertical-line")
                .style("stroke", tableColor)
                .attr("stroke-width", "1.3px");
        }
    }

    function drawLegendContainers(marginLeft){
        svg.append("svg:line")
                .attr("x1", marginLeft)
                .attr("x2", marginLeft)
                .attr("y1", margin.top)
                .attr("y2", h)
                .attr("class", "vertical-line")
                .style("stroke", tableColor)
                .attr("stroke-width", "1.3px");
    }

    function drawColorGradient(marginLeft, x){
        if (getLabel(selectedQuestion, "data-type") != "gradient"){
            return;
        }

        // Draw color gradient
        var colorScale = [];
        colorScale["-1"] = "#44FF44";   // Red
        colorScale["0"] = "#FFFFFF";    // Neutral
        colorScale["1"] = "#FF4444";    // Green
        var gradientOpacity = 0.4;
        var gradientLength = answers.length;

        // Substract "Not sure" answers from the color gradient
        for (var i = 0; i < answers.length; i++){
            var label = getLabel(selectedQuestion, answers[i]);
            if (label != 0 && label.trim() == "Not sure"){
                gradientLength--;
            }
        }

        for (var i = 0; i < answers.length; i++){
            // Ignore "Not sure" answers
            var label = getLabel(selectedQuestion, answers[i]);
            if (label != 0 && label.trim() == "Not sure"){
                continue;
            }
             var rect = svg.append("svg:rect")
                .attr("width", x(i) - x(i-1))
                .attr("class", "colorShade")
                .attr("height", h - margin.bottom)
                .attr("transform", "translate(" + (marginLeft + x(i)) + "," + margin.top + ")")
                .attr("opacity", function(d){
                     if (i == (gradientLength - 1) / 2)
                        return gradientOpacity / (i + 1);
                     else if (i < (gradientLength - 1) / 2)
                        return gradientOpacity / (i + 1);
                     else{
                        return gradientOpacity / (gradientLength - i);
                     }
                 })
                .style("fill", function(d){
                     if (i == (gradientLength - 1) / 2)
                        return colorScale["0"];
                     else if (i < (gradientLength - 1) / 2)
                        return colorScale["1"];
                     else{
                         return colorScale["-1"];
                     }
                 });
            rect.moveToBack();
        }
    }

    function drawYAxisPanel(){
        if (yAxisMode != "All"){
            svg.append("svg:line")
                .attr("x1", yPanelWidth)
                .attr("x2", yPanelWidth)
                .attr("y1", margin.top)
                .attr("y2", h - margin.bottom)
                .attr("class", "vertical-line")
                .style("stroke", tableColor)
                .attr("stroke-width", "1.3px");
        }

        svg.append("svg:text")
            .attr("transform", "rotate(-90)")
            .attr("class", "yPanelLabel")
            .attr("dy", ".71em")
            .attr("fill", legendColor)
            .style("text-anchor", "end")
            .style("font-size", "14px")
            .text(yAxisMode);

        // Reposition label
        var textHeight = $(".yPanelLabel")[0].getBBox().height;
        var textWidth = $(".yPanelLabel")[0].getBBox().width;

        // Case for browsers that do not support the direct use of width()
        /*var browser = ui.getBrowserName;
        if (browser.substring(0,7) == "Firefox" || browser.substr(0,2) == "IE"){
            textHeight = $(".yPanelLabel").text().length * 7;
            textWidth = $(".yPanelLabel").text().length * 7;
            tickWidth = $(".yPanelLabel")[0].textContent.length * 7;
        }*/

        // Reposition y-panelLabel
        $(".yPanelLabel").attr("x", -((h - textWidth - margin.bottom) / 2));
        $(".yPanelLabel").attr("y", yPanelWidth - textHeight - textHeight/2)
    }

    function drawTable(){
        if (svg != null){
            svg.selectAll(".x-legend").remove();
            svg.selectAll(".y-legend").remove();
            svg.selectAll("rect").remove();
            svg.selectAll("line").remove();
            svg.selectAll("rect").remove();
            svg.selectAll(".yPanelLabel").remove();
            //svg.selectAll(".countLabel").remove();
        }

        refreshValues();

        drawYAxisLegend();

        var marginLeft = getYLabelSize() + yPanelWidth;

        var x = d3.scale.linear()
            .domain([0, answers.length])
            .range([0, w - marginLeft]);

        var y = d3.scale.linear()
            .domain([0, options.length])
            .range([0, h - margin.bottom - margin.top]);

        // Draw stuff
        drawOuterRect();

        drawXAxisLegend(marginLeft, x);
        drawVerticalLines(marginLeft, x);
        drawHorizontalLines(y, marginLeft);
        drawLegendContainers(marginLeft);
        drawColorGradient(marginLeft, x);

        drawYAxisPanel();
    }

    function getYLabelSize(){
        var labelWidth = 0;

        for (var i = 0; i < $(".y-legend").length; i++){
            labelWidth = Math.max(labelWidth, $(".y-legend")[i].getBBox().width)
        }

        return labelWidth == 0 ? 0 : labelWidth + 20;
    }


    function transform(d) {
        return "translate(" + d.x + "," + d.y + ")";
    }

    function evenOddTick(val){
        if (val == "even")
            return "odd";
        else return "even"
    }

    function loadQuestions(){
        var title = "";
        var evenOddCounter = "even";

        for (var prop in data.rows[0]){
            var question = prop;
            var questionContent = data.rows[0][prop];

            if (getLabel(question, "data-type") == "map"){
                markerQuestions.push(question);
            }

            if (question != null && (regExp['reMS'].exec(question))){
                var answer = questionContent.substr(questionContent.lastIndexOf('-') + 1, questionContent.length);
                if (title != questionContent.substr(0, questionContent.lastIndexOf('-'))){
                    title = questionContent.substr(0, questionContent.lastIndexOf('-'));
                    var id = regExp['reMS'].exec(question)[1];
                    $("#listQuestions").append('<li class="'+ evenOddCounter +'"><a data-toggle="collapse" class="accordion-toggle" data-parent="#listQuestions" href="' + "#Q" + id + '">' + title + '</a><span class="caret"></span></li>' +
                                                    '<div id="Q' + id + '"  class="panel-collapse collapse">' + '</div>'
                                                );
                    evenOddCounter = evenOddTick(evenOddCounter);
                }

                $("#Q" + id ).append('<li class="indented"><label class="clickable" data-value="' + question+ '">' +
                                                                answer + '</label><span class="btnAdd glyphicon glyphicon-plus"></span></li>');
            }
            else if (question != null && regExp['reS'].exec(question)){
                var id = regExp['reS'].exec(question)[1];
                $("#listQuestions").append('<li class="'+ evenOddCounter +'"><label  class="clickable" data-value="'+ question + '" id="Q' + id + '">' +
                                               questionContent + '</label></li>');
                evenOddCounter = evenOddTick(evenOddCounter);
            }
        }
    }

    function wrap(text, width) {
      text.each(function() {
        var text = d3.select(this),
            words = text.text().split(/\s+/).reverse(),
            word,
            line = [],
            lineNumber = 0,
            lineHeight = 1.1, // ems
            y = text.attr("y"),
            dy = parseFloat(text.attr("dy")),
            tspan = text.text(null).append("tspan").attr("x", 0).attr("y", y).attr("dy", dy + "em");
        while (word = words.pop()) {
          line.push(word);
          tspan.text(line.join(" "));
          if (tspan.node().getComputedTextLength() > width) {
            line.pop();
            tspan.text(line.join(" "));
            line = [word];
            tspan = text.append("tspan").attr("x", 0).attr("y", y).attr("dy", ++lineNumber * lineHeight + dy + "em").text(word);
          }
        }
      });
    }
	return self;
});

