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
    var data, metadata, selectedQuestion, svg, radius_scale;
    var yAxisMode = "All";
    var tooltip = CustomTooltip("gates_tooltip", 240);
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
    var centered;
    var projection = d3.geo.albersUsa()
        .scale(6500)
        .translate([w / 2, h / 2]);
    var zipQuestion = "Q16";
    var centerZip;

    var redToWhiteToGreenScale = d3.scale.linear()     // To be used in nodes and heat map
        .domain([0, 0.5, 1])
        .range(["#FF0000", "#FFF", "#00FF00"]); // Red to White to Green

    var redToYellowToGreenScale = d3.scale.linear()     // To be used in nodes and heat map
        .domain([0,0.5, 1])
        .range(["#FF0000", "#FFFF00", "#00FF00"]); // Red to White to Green

    var defaultBubbleColor = "#C2DBF0";

    var mapContainer;

    var path = d3.geo.path()
        .projection(projection);

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
    var regExp = {multipleQuestionSelectOne: /^Q([0-9]+)([a-z])/,  singleChoice:/^Q([0-9])/};
    var infoQuestions = {};

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

    function getLabel(question, value){
        for (var j = 0; j < metadata.rows.length; j++) {
            var reGetQuestionID = /Q[0-9]+[a-z]*/;
            var questionID = reGetQuestionID.exec(metadata.rows[j]["NewVar"]);
            if (questionID && questionID[0] == question) {
                // Get the labels for this question
                var labels;
                for (var prop in metadata.rows[j]) {
                    if (prop.trim() == "ValueLabels")
                        labels = metadata.rows[j][prop];
                }

                labels = labels.split(";");
                var labelsArray = {};

                // Put the labels in an object for easy access
                for (var i = 0; i < labels.length; i++) {
                    var pos = labels[i].indexOf("=");
                    var index = parseInt(labels[i].substr(0, pos).trim());
                    var val = labels[i].substr(pos + 1, labels[i].length).trim();
                    labelsArray[index] = val;
                }
                return labelsArray[value];
            }
        }
    }

    function initializeGraph(){
        radius_scale = d3.scale.pow().exponent(0.5).domain([0, data.rows.length - 1]).range([2, 85]);

        // Get the list of demographic questions
        for (var j = 0; j < metadata.rows.length; j++) {
            var questionID = metadata.rows[j]["NewVar"];
            var questionLabel = metadata.rows[j]["NewVarLabel"];
            var pluggins = String(metadata.rows[j]["pluggins"]).split(";");
            for (var i = 0; i < pluggins.length; i++) {
                if (pluggins[i] == "isDemographic") {
                    infoQuestions[questionLabel] = questionID;
                }
            }
        }

        nodes = d3.range(data.rows.length - 1).map(function(d, i) {
            var info = {};
            for (var j = 0; j < metadata.rows.length; j++) {
                var questionID = metadata.rows[j]["NewVar"];
                var questionLabel = metadata.rows[j]["NewVarLabel"];
                var pluggins = String(metadata.rows[j]["pluggins"]).split(";");
                for (var p = 0; p < pluggins.length; p++) {
                    if (pluggins[p] == "isDemographic") {
                        info[questionLabel] = data.rows[i + 1][questionID];
                    }
                }
            }

            return {value: 0, info: info, temp:false, tempPosY:0};
        });

        svg = d3.select("#visualizationContent").append("svg:svg")
            .attr("width", w)
            .attr("height", h);

        mapContainer = svg.append("g")
            .attr("class", "map-container");
        $("map-container").hide();
        $("#btnCategories")[0].disabled = true;
        loadHeatMap();
        drawTable();
        setPercentageView();    // start the site in percentage view

        // Pre-load markers for questions that use the map
        for (var i = 0; i < markerQuestions.length; i++){
            loadMarkerData(markerQuestions[i]);
        }
        //loadMarkerData(question);

         // Add demographic items to dropdown
        for (var j = 0; j < metadata.rows.length; j++) {
            //var questionID = metadata.rows[j]["NewVar"];
            var questionLabel = metadata.rows[j]["NewVarLabel"];
            var pluggins = String(metadata.rows[j]["pluggins"]).split(";");
            for (var i = 0; i < pluggins.length; i++) {
                if (pluggins[i] == "isDemographic") {
                    $("#lstYAxisMode").append('<li><a data-axis="'+ questionLabel +'" href="#">'+ questionLabel +'</a></li>')
                }
            }
        }

        $("#percentage-view").click(setPercentageView);
        $("#map-view").click(setHeatMapView);
        $("#mean-view").click(setMeanView);

        $('#listQuestions .clickable').click(onListQuestionClick);
        $('#listQuestions li').click(onListQuestionClick);
        $('#lstYAxisMode li:not(.disabled)').click(onYAxisModeChange);
        $("#lstYAxisMode li:first-child").addClass("disabled"); // Start with the selected category disabled
        $(".btnAdd").click(onBtnAddClick);
        $(".btnSubstract").click(onBtnSubstractClick);
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

        // Prevents the event from triggering twice with the same question or triggering when the button is disabled
        if(that.length == 0 || that[0].getAttribute("data-value") == selectedQuestion || that.hasClass("disabled")){
            return;
        }

        if (that.length == 0){
            return;
        }

        $("#btnCategories")[0].disabled=false;
        $("#map-view")[0].disabled=false;
        $("#mean-view")[0].disabled=false;

        // Refresh y-axis mode
        numberOfQuestions = 1;
        restoreYAxisMode();

        $('#listQuestions li').removeClass("active");
        that.closest("li").addClass("active");
        selectedQuestion = that.attr("data-value");

        var pos;
        if (data.rows[0][selectedQuestion]){
            pos = data.rows[0][selectedQuestion].lastIndexOf('-')
        }

        var title = "";
        if (pos && pos != -1){
            title = data.rows[0][selectedQuestion].substr(0, pos);
        }
        else{
            title = data.rows[0][selectedQuestion];
        }

        var content;
        if (pos && pos != -1){
            content = data.rows[0][selectedQuestion].substr(pos + 1, data.rows[0][selectedQuestion].length);
        }
        else{
            content = data.rows[0][selectedQuestion];
        }

        // Toggle add button visibility
        $(".btnAdd").hide();
        $(".btnSubstract").hide();
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
        $("#txtDescription").text(content);
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


        if (hasPluggin(selectedQuestion, "heatmap")) {
            $("#map-view")[0].disabled = false;
        }
        else {
            $("#map-view")[0].disabled = true;
        }

        if (hasPluggin(selectedQuestion, "mean")) {
            $("#mean-view")[0].disabled = false;
        }
        else {
            $("#mean-view")[0].disabled = true;
        }

        if (view == "percentage"){
            drawTable();
            svg.selectAll("circle").remove();
            svg.selectAll(".node").transition().duration(550).remove();
            svg.selectAll(".fixedNode").transition().duration(550).remove();
            svg.selectAll(".fixedNode text").remove();
            updatePercentageView();
        }
        else if (view == "heatmap") {
            updateHeatMap();
            $(".btnAdd").hide();
        }
        else if (view == "mean") {
            $(".btnAdd").hide();
            updateMeanView();
        }
    }

    function drawMeanViewTable() {
        if (svg != null) {
            svg.selectAll(".x-legend").remove();
            svg.selectAll(".y-legend").remove();
            svg.selectAll("rect.table-rect").remove();
            svg.selectAll("rect.color-shade").remove();
            svg.selectAll("rect.gray-alternation").remove();
            svg.selectAll("line").remove();
            svg.selectAll(".yPanelLabel").remove();
            svg.selectAll(".mean-base-line").remove();
            svg.selectAll(".vertical-mean-line").remove()
        }

        drawYAxisLegend();

        var marginLeft = getYLabelSize() + yPanelWidth;

        var x = d3.scale.linear()
            .domain([0, answers.length])
            .range([0, w - marginLeft]);

        var y = d3.scale.linear()
            .domain([0, options.length])
            .range([0, h - margin.bottom - margin.top]);

        drawOuterRect();

        // Draw x axis legend and ignore not sure responses
        var value = $(".active label").attr("data-value");
        var deltaX = (x(1) - x(0));
        var deltaY = y(1) - y(0);

        for (var j = 0; j < metadata.rows.length; j++) {
            var questionID = metadata.rows[j]["NewVar"];
            if (questionID == value) {
                // Get the labels for this question
                var labels;
                for (var prop in metadata.rows[j]) {
                    if (prop.trim() == "ValueLabels")
                        labels = String(metadata.rows[j][prop]);
                }

                labels = labels.split(";");
                var labelsArray = {};

                // Put the labels in an object for easy access
                for (var i = 0; i < labels.length; i++) {
                    var pos = labels[i].indexOf("=");
                    var index = parseInt(labels[i].substr(0, pos).trim());
                    var value = labels[i].substr(pos + 1, labels[i].length).trim();

                    labelsArray[index] = value;

                    if (value == "not sure") {
                        x.domain([0, answers.length - 1]);  // Rescale x axis to make up for ignoring 'not sure' responses
                        deltaX = (x(1) - x(0));
                    }
                }

                // Draw legend for each answer
                for (var i = 0; i < answers.length; i++) {
                    if (labelsArray[answers[i]] != "not sure"){
                        svg.append("text")
                            .attr("dx", 0)
                            .attr("dy", 0)
                            .attr("class", "x-legend")
                            .attr("text-anchor", "middle")
                            .attr("font-weight", "normal")
                            .attr("fill", legendColor)
                            .attr("y", h - margin.bottom + 30)
                            .attr("id", "x-legend" + i)
                            .attr("transform", "translate(" + ( x(i) + marginLeft + deltaX / 2) + "," + 0 + ")")
                            .attr("data-id", i)
                            .text(function () {
                                if (!selectedQuestion) {
                                    return "";
                                }

                                // Just return the actual value for text input questions
                                if (selectedQuestion.indexOf("- Text") != -1) {
                                    return answers[i];
                                }

                                return labelsArray[answers[i]];
                            })
                            .call(wrap, deltaX);
                    }
                }
            }
        }
        // -----

        // Draw vertical dotted lines
        for (var i = 1; i < answers.length + 1; i++) {
            if ((answers[i - 1] && labelsArray[answers[i - 1]] != "not sure") || answers.length == 1) {
                svg.append("svg:line")
                    .attr("x1", x(i) + marginLeft - deltaX / 2)
                    .attr("x2", x(i) + marginLeft - deltaX / 2)
                    .attr("y1", margin.top)
                    .attr("y2", h - margin.bottom)
                    .attr("class", "vertical-mean-line")
                    .attr("stroke-dasharray", "1, 5")
                    .attr("stroke-linecap", "round")
                    .style("stroke", tableColor)
            }
        }

        // Draw table horizontal lines
        for (var i = 1; i <= options.length; i++) {
            svg.append("svg:line")
                .attr("x1", yPanelWidth)
                .attr("x2", yPanelWidth + getYLabelSize())
                .attr("y1", y(i))
                .attr("y2", y(i))
                //.attr("id", "line" + i)
                .attr("data-id", i)
                .attr("class", "horizontal-line")
                .attr("transform", "translate(" + 0 + "," + margin.top + ")")
                .style("stroke", tableColor)
                .style("stroke-width", "1.3px")
        }

        // Gray alternation
        //for (var i = 0; i <= options.length - 1; i++){
        //    var grad = svg.append("svg:rect")
        //        .attr("width", w)
        //        .attr("height", y(1) - y(0))
        //        .attr("class", "gray-alternation")
        //        .attr("transform", "translate(" + yPanelWidth + "," + y(i) + ")")
        //        .attr("opacity", (i % 2 == 0) ? 0 : 0.1)
        //        .style("fill", "#000");
        //
        //    grad.moveToBack();
        //}

        // Line at the top of x axis legend
        svg.append("svg:line")
            .attr("x1", 0)
            .attr("x2", w)
            .attr("y1", h - margin.bottom)
            .attr("y2", h - margin.bottom)
            .attr("class", "horizontal-line")
            .style("stroke", tableColor)
            .style("stroke-width", "1.3px");

        marginLeft = getYLabelSize() + yPanelWidth;

        var colorData = [];
        var stops = $(".vertical-mean-line").length - 1;
        for (var i = 0; i <= stops; i++){
            var offset = i * 100/stops;
            colorData.push({offset:  offset + "%", color:redToYellowToGreenScale(offset / 100)})
        }

        var left = yPanelWidth + deltaX / 2 + getYLabelSize();
        var right = w - deltaX / 2;

        $("linearGradient").remove();
        svg.append("linearGradient")
            .attr("id", "line-gradient")
            .attr("gradientUnits", "userSpaceOnUse")
            .attr("x1", left).attr("y1", 0)
            .attr("x2", right).attr("y2", 0)
            .selectAll("stop")
            .data(colorData)
            .enter().append("stop")
            .attr("offset", function (d) {
                return d.offset;
            })
            .attr("stop-color", function (d) {
                return d.color;
            });

        //Draw mean base lines

         x = d3.scale.linear()
            .domain([1, answers.length])
            .range([left, right]);

        for (var i = 1; i <= options.length; i++){
            svg.append("svg:line")
                .attr("x1", x(1))
                .attr("x2", x(answers.length))
                .attr("y1", y(i) - deltaY/2)
                .attr("y2", y(i) - deltaY/2)
                .attr("data-id", i)
                .attr("class", "mean-base-line")
                .attr("transform", "translate(" + 0 + "," + margin.top + ")")

            // Draw pivot points
            //svg.append("svg:line")
            //        .attr("x1", left)
            //        .attr("x2", left)
            //        .attr("y1", y(i) - deltaY/2 - 10)
            //        .attr("y2", y(i) - deltaY/2 + 10)
            //        .attr("class", "mean-base-line");
            //
            //svg.append("svg:line")
            //        .attr("x1", right)
            //        .attr("x2", right)
            //        .attr("y1", y(i) - deltaY/2 - 10)
            //        .attr("y2", y(i) - deltaY/2 + 10)
            //        .attr("class", "mean-base-line");
        }

        if (selectedQuestion) {
            // ---------- Draw means ----------------------
            var nodeRows = d3.range(options.length).map(function (i) {
                return {
                    total: 0,
                    participants: 0,
                    y: i
                };
            });

            nodes.forEach(function (d) {
                if (getLabel(selectedQuestion, d.value) == "not sure"){
                    return;
                }
                var posOption = ($.inArray(d.info[yAxisMode], options));
                if (yAxisMode == "") {
                    posOption = d.tempPosY;
                }
                var val = d.value;

                nodeRows.forEach(function (o) {
                    if (o.y == posOption) {
                        o.participants += 1;
                        o.total += val;
                    }
                })
            });

            for (var i = 1; i <= options.length; i++) {
                // Draw mean
                var xCord = (nodeRows[i - 1].total) / nodeRows[i - 1].participants;
                var currLine = svg.append("svg:line")
                    .attr("x1", x((answers.length + 1) / 2))
                    .attr("x2", x((answers.length + 1) / 2))
                    .attr("y1", y(i) - deltaY / 2 - 15)
                    .attr("y2", y(i) - deltaY / 2 + 15)
                    .style("stroke", tableColor)
                    .style("stroke-width", "7px");

                currLine.transition()
                    .duration(400)
                    .ease("linear")
                    .attr({
                        'x1': x(xCord),
                        'x2': x(xCord)
                    })
            }
        }

        drawLegendContainers(marginLeft);

        drawYAxisPanel();
    }

    function updateMeanView(){
        refreshValues();
        drawMeanViewTable();
    }

    function updateHeatMap(){
        refreshValues();
        var responses = _.map(nodes, function (a, b) {
            for (var prop in data.rows[b + 1]) {
                if (prop.trim() == zipQuestion)
                    return {zipcode: data.rows[b + 1][prop], value: data.rows[b + 1][selectedQuestion]}
            }
        });

        var numberOfAnswers = answers.length;

        // Substract "Not sure" answers
        for (var i = 0; i < answers.length; i++) {
            var label = getLabel(selectedQuestion, answers[i]);
            if (label && label.trim() == "not sure") {
                responses = _.filter(responses, function(resp){
                    return resp.value != i + 1;
                })
                numberOfAnswers--;
            }
        }

        var participants = _(responses).countBy("zipcode");     // Array to keep track of the number of participants in each zip code
        var totals = {};                                        // Array to keep track of the total concern by all participants in each zip code

        for (var obj in participants) {
            totals[obj] = 0;
        }

        for (var zip in responses) {
            if (responses[zip].zipcode != null)
                totals[responses[zip].zipcode] += responses[zip].value;   // Populate totals
        }

        // Reset background nad hover functions for all paths
        var paths = d3.selectAll('path[data-zip]');
            paths.on("mouseover", function (d) {
                var content =   "<span class=\"name\">" + d.properties.NAME + "</span><span class=\"value\"></span><br/>" +
                                "<span class=\"name\">Zip code: </span><span class=\"value\">" + d.properties.ZIP5 + "</span><br/>";
                tooltip.showTooltip(content, d3.event);
            })

        for (var zip in totals) {
            var path = d3.select('path[data-zip="' + zip + '"]');
            if (path[0][0] != null) {
                path.on("mouseover", function (obj) {
                    var zip = obj.properties.ZIP5;
                    var content =   "<span class=\"name\">" + obj.properties.NAME + "</span><span class=\"value\"></span><br/>" +
                                    "<span class=\"name\">Zip code: </span><span class=\"value\">" + zip + "</span><br/>" +
                                    //"<span class=\"name\">Avg: </span><span class=\"value\">" + parseFloat((totals[zip] / participants[zip])).toFixed(2) + "</span><br/>" +
                                    "<span class=\"name\">Participants: </span><span class=\"value\">" + participants[zip] + "</span><br/>";
                        tooltip.showTooltip(content, d3.event);
                });
                // Map refresh animation
                path.transition().duration(100).attr("fill","#3D4348");
                path.transition().duration(500).delay(100).attr("fill",function(d){
                    return redToWhiteToGreenScale((totals[zip] / participants[zip]) / numberOfAnswers);
                });
            }
            else{
                //console.log("Warning: path not found for zip code " + zip + " which contains " + participants[zip] + " participants.");
            }
        }
        // Update legend
        var rHeight = numberOfAnswers * (20 + 12);
        var rWidth = 300;
        svg.select(".heat-map-legend").remove();
        var heatMapLegendArea = svg.append("g")
            .attr("transform", "translate(" + (w - rWidth) + "," + (h - rHeight - margin.top) + ")")
            .attr("class", "heat-map-legend");

        heatMapLegendArea.append("svg:rect")
            .attr("width", rWidth)
            .attr("height", rHeight)
            .attr("class", "heat-map-legend-rect")
            .style("fill", "#FFF")
            .style("stroke", "#000")
            .style("stroke-width", "1px")
            .style("opacity", 0.75);

        var counter = 0;
        for (var i = 0; i < numberOfAnswers; i++) {
            var label = getLabel(selectedQuestion, answers[i]);
            if (label)
                label = label.trim();
            if (label != "not sure") {
                heatMapLegendArea.append("svg:rect")
                    .attr("width", 30)
                    .attr("height", 20)
                    .style("fill", redToWhiteToGreenScale(answers[i] / numberOfAnswers))
                    //.style("fill", redToWhiteToGreenScale(answers[i] / numberOfAnswers))
                    .attr("class", "color-block")
                    .style("stroke", "#000")
                    .style("stroke-width", "1px")
                    .attr("transform", "translate(" + 10 + "," + (10 + counter * 30) + ")")

                heatMapLegendArea.append("svg:text")
                    .attr("x", 50)
                    .attr("y", (counter * 30) + 20)
                    .attr("dy", ".31em")
                    .attr("class", "hm-legend")
                    .style("fill", "#000")
                    .text(label)
                counter++;
            }
        }
    }

    function showOnly(questionType){
        var items = $(".clickable");
        for (var i = 0; i < items.length; i++){
            var question = items[i].getAttribute("data-value");
            if (!hasPluggin(question, questionType)){
               $(items[i]).addClass("disabled");
            }
        }
    }

    function showAllQuestions(){
        $(".clickable").removeClass("disabled");
    }

    function onBtnSubstractClick(e){
        $(this).closest("li").removeClass("active");
        $(this).hide();

        $(this).parent().find(".btnAdd").show();

        updateOnMultipleQuestions($(this));
    }

    function onBtnAddClick(e){
        $(this).closest("li").addClass("active");
        $(this).hide();

        $(this).parent().find(".btnSubstract").show();
        updateOnMultipleQuestions($(this));
    }

    function restoreYAxisMode(){
        var mode = $("#lstYAxisMode .disabled a")[0].getAttribute("data-axis");
        yAxisMode = mode;
    }

    function updateOnMultipleQuestions(element){
        yAxisMode = "";
        numberOfQuestions = element.parent().parent().find(".active").length;

        if (numberOfQuestions > 1){
            // Show substract button for this item
            element.parent().parent().find(".active .clickable").parent().find(".btnSubstract").show();
            $("#btnCategories")[0].disabled = true;
            $("#map-view")[0].disabled = true;
            $("#mean-view")[0].disabled = true;
        }
        else{
            $(".btnSubstract").hide();
            restoreYAxisMode();
            $("#btnCategories")[0].disabled = false;
            $("#map-view")[0].disabled = false;
            $("#mean-view")[0].disabled = false;
        }

        // Load labels for y-axis
        var labels = element.parent().parent().find(".active .clickable");
        for (var i = 0; i < labels.length; i++) {
            labels[i] = $(labels[i]).text();
        }

        if (svg != null) {
            svg.selectAll(".x-legend").remove();
            svg.selectAll(".y-legend").remove();
            svg.selectAll("rect.table-rect").remove();
            svg.selectAll("rect.color-shade").remove();
            svg.selectAll("rect.gray-alternation").remove();
            svg.selectAll("line").remove();
            svg.selectAll(".yPanelLabel").remove();
            //svg.selectAll(".countLabel").remove();
        }

        options = _.range(numberOfQuestions);

        if (numberOfQuestions > 1) {
            // Draw y-axis legend
            for (var i = 0; i < numberOfQuestions; i++) {
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
                    .text(function () {
                        return labels[i];
                    });
                //.call(wrap, 150);
                $("#txtDescription").text("");
            }
        }
        else{
            drawYAxisLegend();
            $("#txtDescription").text(element.parent().parent().find(".active .clickable").text());
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
        drawYAxisPanel();
        drawXAxisLegend(marginLeft, x);

        // Add a set of nodes for each selected question
        removeTempNodes();
        var nodesCopy = nodes.slice();
        var tempQuestions = element.parent().parent().find(".active .clickable");

        // Get list of selected questions
        for (var i = 0; i < labels.length; i++){
            tempQuestions[i] = tempQuestions[i].getAttribute("data-value");
        }

        questionNodes = [];

        for (var j = 0; j < tempQuestions.length; j++){ // -1 because the first set of nodes is already the original set
            questionNodes[j] = [];
            for (var i = 0; i < nodesCopy.length; i++){
                var tempNode = {
                    value: data.rows[i + 1][tempQuestions[j]],
                    info:nodesCopy[i].info,
                    temp:true,
                    tempPosY:j
                }
                questionNodes[j].push(tempNode);
            }
        }
        // Move each set of nodes
        if (view == "heatmap"){

        }
        else if (view == "percentage"){
            svg.selectAll(".fixedNode").remove();
            svg.selectAll(".countLabel").remove();
            svg.selectAll("circle").transition().duration(500).attr("r", 1e-6).remove();
            updatePercentageView();
        }
        else if (view == "mean"){

        }

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

        if (view == "heatmap"){

        }
        else if (view == "percentage"){
            svg.selectAll("circle").remove();
            svg.selectAll(".node").transition().duration(550).remove();
            svg.selectAll(".fixedNode").transition().duration(550).remove();
            svg.selectAll(".fixedNode text").remove();
            svg.selectAll(".countLabel").remove();
            updatePercentageView();
        }
        else if (view == "mean"){
            updateMeanView();
        }
    }

    function setMeanView(){
        $("#percentage-view").removeClass("disabled");
        $("#map-view").removeClass("disabled");
        $("#mean-view").addClass("disabled");

        view = "mean";

        svg.selectAll(".countLabel").remove();
        svg.selectAll(".fixedNode").remove();
        svg.selectAll("line").remove();
        svg.selectAll("text:not(.hm-legend)").remove();
        svg.selectAll("rect.table-rect").remove();
        svg.selectAll("rect.gray-alternation").remove();
        svg.selectAll("rect.color-shade").remove();

        $(".map-container").hide();
        $(".heat-map-legend").hide();
        //$("#btnCategories")[0].disabled = true;
        $("#btnCategories").show();
        $(".btnAdd").hide();
        showOnly("mean");

        updateMeanView();
    }

    function setPercentageView(){
        if (view == "percentage")
            return;

        view = "percentage";
        $(".map-container").hide();
        $(".heat-map-legend").hide();

        $("#percentage-view").addClass("disabled");
        $("#map-view").removeClass("disabled");
        $("#mean-view").removeClass("disabled");

        svg.selectAll(".countLabel").remove();
        svg.selectAll("circle").transition().duration(500).attr("r", 1e-6).remove();

        $("#btnCategories").show();

        //$("#btnCategories")[0].disabled = false;

        drawTable();

        // If a question has been clicked, update
        if ($("#listQuestions").find(".active").length > 0)
            updatePercentageView();

        showAllQuestions();
    }


    function setHeatMapView(){
        view = "heatmap";

        $("#map-view").addClass("disabled");
        $("#percentage-view").removeClass("disabled");
        $("#mean-view").removeClass("disabled");

        svg.selectAll(".countLabel").remove();
        svg.selectAll(".fixedNode").remove();
        svg.selectAll("line").remove();
        svg.selectAll("text:not(.hm-legend)").remove();
        svg.selectAll("rect.table-rect").remove();
        svg.selectAll("rect.gray-alternation").remove();
        svg.selectAll("rect.color-shade").remove();

        $(".map-container").show();
        $(".heat-map-legend").show();

        showOnly("heatmap");

        $(".btnAdd").hide();
        $("#btnCategories").hide();

        drawOuterRect();

        updateHeatMap();
    }

    function loadHeatMap() {
        queue()
            .defer(d3.json, "/surveydata/static/files/zipcodes.json")    // put trailing '/surveydata' to push to production
            .await(plotZipCodes);

        function plotZipCodes(error, us) {
            //var zipCodes = _.map(nodes, function(a, b){return {zipcode:data.rows[b + 1][zipQuestion]}});
            //zipCodes = _(zipCodes).countBy("zipcode");

            // Append polygons for zip codes
            mapContainer.append("g")
                .attr("class", "zips")
                .selectAll("path")
                .data(topojson.feature(us, us.objects.zip_codes_for_utah).features)
                .enter()
                .append("path")
                //.filter(function(d) {
                //    if (zipCodes[d.properties.ZIP5] == "84632") {
                //        return true; //This item will be included in the selection
                //    } else {
                //        return false; //This item will be excluded, e.g. "cheese"
                //    }
                //})
                .attr("data-zip", function (d) {
                    if (d.properties.ZIP5 == "84632") {   // zipcode used as reference to center the map
                        centerZip = d;
                    }
                    return d.properties.ZIP5;
                })
                .attr("data-name", function (d) {
                    return d.properties.NAME;
                })
                .on("mouseover", function (d) {
                    var content =   "<span class=\"name\">" + d.properties.NAME + "</span><span class=\"value\"></span><br/>" +
                                    "<span class=\"name\">Zip code: </span><span class=\"value\">" + d.properties.ZIP5 + "</span><br/>";
                    tooltip.showTooltip(content, d3.event);
                    this.parentNode.appendChild(this);
                })
                .on("mouseout", function () {
                    tooltip.hideTooltip();
                })
                .attr("fill", "#3D4348")
                //.attr("transform", "rotate(-10)")
                .on("click", clicked)
                .attr("d", path);

            centerAt(centerZip);  // Center the map

        }
    }

    function centerAt(d){
        var x, y, k;

        var centroid = path.centroid(d);
        x = centroid[0];
        y = centroid[1];
        k = 1;  // Zoom level

        mapContainer.selectAll("path")
            .classed("active", centered && function (d) {
                return d === centered;
            });

        mapContainer.transition()
            .duration(750).attr("transform", "translate(" + w / 2 + "," + h / 2 + ")scale(" + k + ")translate(" + -x + "," + -y + ")");
    }

    function clicked(d) {
        var x, y, k;

        if (d && centered !== d) {
            var centroid = path.centroid(d);
            x = centroid[0];
            y = centroid[1];
            k = 3;  // Zoom level
            centered = d;
        } else {
            centered = null;
        }

        mapContainer.selectAll("path")
            .classed("active", centered && function (d) {
                return d === centered;
            });

        if (centered){
            mapContainer.transition()
            .duration(750)
            .attr("transform", "translate(" + w / 2 + "," + h / 2 + ")scale(" + k + ")translate(" + -x + "," + -y + ")");
        }
        else{
            centerAt(centerZip);
        }
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

    function getGradient(color, id){
        var gradient = svg.append("svg:defs")
            .append("svg:linearGradient")
            .attr("id", "gradient" + (id))
            .attr("x1", "0%")
            .attr("y1", "0%")
            .attr("x2", "100%")
            .attr("y2", "100%")
            .attr("spreadMethod", "pad");

        // Define the gradient colors
        gradient.append("svg:stop")
            .attr("offset", "0%")
            .attr("stop-color", color)
            .attr("stop-opacity", 1);

        gradient.append("svg:stop")
            .attr("offset", "100%")
            .attr("stop-color", d3.rgb(color).darker(2))
            .attr("stop-opacity", 1);
    }

    function updatePercentageView(){
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
            .attr("stroke-width", "1")
            .on("mouseover", function (d) {
                d3.select(this).attr("stroke-width", "2");
            })
            .on("mouseout", function () {
                d3.select(this).attr("stroke-width", "1");
            });


        var numberOfAnswers = answers.length;
        // Substract "Not sure" answers from the color gradient
        for (var i = 0; i < answers.length; i++){
            var label = getLabel(selectedQuestion, answers[i]);
            if (label && label != 0 && label.trim() == "not sure"){
                numberOfAnswers--;
            }
        }

        // Define the gradient
        $("linearGradient").remove();       // Remove previous ones
        var gradientCount = 2;
        getGradient(defaultBubbleColor, 0); // gradient0 - default gradient
        getGradient("#9c9c9c", 1);          // gradient1 - not sure

        fixedNodesContainers.append("svg:circle")
            .style("stroke", function (d) {
                var label = getLabel(selectedQuestion, answers[d.pos.x]);
                if (!hasPluggin(selectedQuestion, "heatmap")) {
                    return "#888";
                }

                if (!label || label.trim() != "not sure")
                    return d3.rgb(redToWhiteToGreenScale(d.pos.x / (numberOfAnswers - 1))).darker(2);

                if (!label || label.trim() == "not sure")
                    return d3.rgb("#9c9c9c").darker(2);

                return d3.rgb(defaultBubbleColor).darker(2);
            })
            .attr("r", "15")
            .attr("fill", function(d){
                var label = getLabel(selectedQuestion, answers[d.pos.x]);
                if (!hasPluggin(selectedQuestion, "heatmap")) {
                    //return defaultBubbleColor;
                    return 'url(#gradient0)';   // Default gradient
                }

                if (!label || label.trim() != "not sure") {
                    var color = redToWhiteToGreenScale(d.pos.x / (numberOfAnswers - 1));
                    getGradient(color,gradientCount);
                    var gradient = 'url(#gradient' + gradientCount +')';
                    gradientCount++;
                    return gradient;
                }
                if (!label || label.trim() == "not sure")
                    return 'url(#gradient1)';

                return defaultBubbleColor;
            })
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
            });

        // Append percentages
        fixedNodesContainers.append("svg:text")
            .attr("x", function (d) {
                var delta = (w - marginLeft)/(answers.length);
                return (d.pos.x * delta) + marginLeft + delta/2;
            })
            .attr("y", function (d) {
                var delta = (h - margin.bottom)/(options.length);
                return (d.pos.y + 1) * delta - 10;
            })
            .style("text-anchor", "middle")
            .style("font-size", "14px")
            .attr("visibility", function (d) {
                if (d.amount == 0) {
                    return "hidden";
                }
                return "visible";
            })
            .attr("dy", ".31em")
            //.style("text-decoration", "underline")
            .style("fill", "#000")
            .text(0).transition().duration(700).tween("text", function (d) {
                var rowTotal = 0;   // Percentage is calculated per row

                fixedNodes.forEach(function (o) {
                    if (o.y == d.y) {
                        rowTotal += o.amount;
                    }
                });

                var i = d3.interpolate(this.textContent, (100 / rowTotal) * d.amount),
                    prec = (d.amount + "").split("."),
                    round = (prec.length > 1) ? Math.pow(10, prec[1].length) : 1;

                return function (t) {
                    var value = (i(t) * round / round).toFixed(2);
                    this.textContent = value + "%";
                };
            });

        // Append (n)
        fixedNodesContainers.append("svg:text")
            .attr("x", function (d) {
                var delta = (w - marginLeft)/(answers.length);
                return (d.pos.x * delta) + marginLeft + delta - 3;
            })
            .attr("y", function (d) {
                var delta = (h - margin.bottom)/(options.length);
                return (d.pos.y + 1) * delta - 10;
            })
            .style("text-anchor", "end")
            .style("font-size", "12px")
            .attr("visibility", function (d) {
                if (d.amount == 0) {
                    return "hidden";
                }
                return "visible";
            })
            .attr("dy", ".31em")
            //.style("text-decoration", "underline")
            .style("fill", "#000")
            .text(0).transition().duration(700).tween("text", function(d) {
                var i = d3.interpolate(this.textContent, d.amount)

                return function(t) {
                    this.textContent = "(n = " + (Math.round(i(t))) + ")";
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
        .style("fill", "none")
        .attr("class", "table-rect");
    }

    function hasPluggin(question, pluggin){
        for (var j = 0; j < metadata.rows.length; j++) {
            var questionID = metadata.rows[j]["NewVar"];
            if (questionID  == question) {
                var pluggins = String(metadata.rows[j]["pluggins"]).split(";");
                for (var i = 0; i < pluggins.length; i++){
                    if (pluggins[i] == pluggin){
                        return true;
                    }
                }
            }
        }
        return false;
    }

    function drawXAxisLegend(marginLeft, x){
        var value = $(".active label").attr("data-value");
        var delta = (x(1) - x(0));

        for (var j = 0; j < metadata.rows.length; j++) {
            //var reGetQuestionID = /Q[0-9]+[a-z]*/;
            var questionID = metadata.rows[j]["NewVar"];
            if (questionID == value){
                // Get the labels for this question
                var labels;
                for (var prop in metadata.rows[j]) {
                    if (prop.trim() == "ValueLabels")
                        labels = String(metadata.rows[j][prop]);
                }

                labels = labels.split(";");
                var labelsArray = {};

                // Put the labels in an object for easy access
                for (var i = 0; i < labels.length; i++){
                    var pos = labels[i].indexOf("=");
                    var index = parseInt(labels[i].substr(0, pos).trim());
                    var value = labels[i].substr(pos + 1, labels[i].length).trim();
                    labelsArray[index] = value;
                }

                // Draw legend for each answer
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
                           if (!selectedQuestion){
                               return "";
                           }

                           // Just return the actual value for text input questions
                           if (selectedQuestion.indexOf("- Text") != -1){
                               return answers[i];
                           }

                           return labelsArray[answers[i]];
                      })
                      .call(wrap, delta);
                }
            }
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

                   for (var j = 0; j < metadata.rows.length; j++){
                       var questionID = metadata.rows[j]["NewVar"];
                       if (questionID == infoQuestions[yAxisMode]){
                           if (getLabel(questionID, options[i]) == null){
                               return options[i];
                           }
                           return getLabel(questionID, options[i]);
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
                .attr("class", "gray-alternation")
                .attr("transform", "translate(" + yPanelWidth + "," + y(i) + ")")
                .attr("opacity", (i % 2 == 0) ? 0 : 0.1)
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
            svg.selectAll("rect.table-rect").remove();
            svg.selectAll("rect.color-shade").remove();
            svg.selectAll("rect.gray-alternation").remove();
            svg.selectAll("line").remove();
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

            if (question != null && isMultipleSelectOne(question)){
                var answer = questionContent.substr(questionContent.lastIndexOf('-') + 1, questionContent.length);
                var id = regExp['multipleQuestionSelectOne'].exec(question)[1];
                if ($("#Q" + id).length == 0){
                    title = getQuestionTitle(question);

                    $("#listQuestions").append('<li class="'+ evenOddCounter +'"><a data-toggle="collapse" class="accordion-toggle" data-parent="#listQuestions" href="' + "#Q" + id + '">' +
                        title +
                        '</a><span class="caret"></span></li>' + '<div id="Q' + id + '"  class="panel-collapse collapse">' + '</div>');
                    evenOddCounter = evenOddTick(evenOddCounter);
                }

                $("#Q" + id ).append('<li class="indented"><label class="clickable" data-value="' + question+ '">' +
                                                                answer + '</label><span class="btnAdd glyphicon glyphicon-plus"></span></label><span class="btnSubstract glyphicon glyphicon-minus"></span></li>');
            }
            else if (question != null && isSingleChoice(question)){
                var id = regExp['singleChoice'].exec(question)[1];
                $("#listQuestions").append('<li class="'+ evenOddCounter +'"><label  class="clickable" data-value="'+ question + '" id="Q' + id + '">' +
                                               questionContent + '</label></li>');
                evenOddCounter = evenOddTick(evenOddCounter);
            }
        }
    }

    function isMultipleSelectOne(questionID){
        if(regExp['multipleQuestionSelectOne'].exec(questionID)){
            return true;
        }
        return false;
    }

    function isSingleChoice(questionID){
        if (regExp['singleChoice'].exec(questionID)){
            return true;
        }
        return false;
    }

    function getQuestionTitle(questionID){
        for (var i = 0; i < metadata.rows.length; i++){
            if (metadata.rows[i]["NewVar"] == questionID){
                if(regExp['multipleQuestionSelectOne'].exec(questionID)){
                    var title = metadata.rows[i]["NewVarLabel"];
                    var titleEnd = title.indexOf('-');
                    if (titleEnd > -1){
                        title = title.substr(0, titleEnd);
                    }
                    return title;
                }
                return metadata.rows[i]["NewVarLabel"];

            }

        }
        return "";
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

