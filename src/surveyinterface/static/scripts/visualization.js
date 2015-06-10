if (typeof Array.prototype.getUnique != 'function') {
    Array.prototype.getUnique = function () {
        var u = {}, a = [];
        for (var i = 0, l = this.length; i < l; ++i) {
            if (u.hasOwnProperty(this[i])) {
                continue;
            }
            a.push(this[i]);
            u[this[i]] = 1;
        }
        return a;
    }
}

if (typeof String.prototype.startsWith != 'function') {
    String.prototype.startsWith = function (str) {
        return this.indexOf(str) == 0;
    };
}

define('visualization', ['bootstrap', 'd3Libraries', 'mapLibraries', 'underscore'], function () {
    var self = {};
    var data, metadata, selectedQuestion, svg, radius_scale;
    var yAxisMode = "All";
    var tooltip = CustomTooltip("gates_tooltip", 240);
    var margin = {top: 0, bottom: 60, left: 0, right: 5};
    var w = $("#visualizationContent").width(), h = $("#visualizationContent").height() - $("#top-bar").height() - 1;
    var view = "";
    var svg;
    var answers = [];
    var options = [];
    var tableColor = "#666";
    var legendColor = "#000";
    var yPanelWidth = 80;
    var gradientCount = 0;
    var map;
    var nodes = [];
    var markerQuestions = [];
    var numberOfQuestions = 0;
    var questionNodes = [];
    var cutoff = 5;
    var mapZoom = d3.behavior.zoom()
        .scaleExtent([1, 12]).on("zoom", zoom);
    var spatialQuestion = "Q16";        // TODO: SEARCH FOR THIS QUESTION ID IN THE METADATA FILE
    var centerZip;
    var path;
    var tips;

    var bidirectionalScale = d3.scale.linear()     // To be used in nodes and heat map
        .domain([0, 1/11, 2/11, 3/11, 4/11, 5/11, 6/11, 7/11, 8/11, 9/11, 10/11, 1])
        .range(["#2A0BD9", "#264EFF", "#40A1FF", "#73DAFF", "#ABF8FF", "#E0FFFF", "#FFFFBF", "#FFE099", "#FFAD73", "#F76E5E", "#D92632", "#A60021"]); // Red to White to Green

    var unidirectionalScale = d3.scale.linear()
        .domain([0, 1/9, 2/9, 3/9, 4/9, 5/9, 6/9, 7/9, 8/9, 1])
        .range(["#E6FFFF", "#CCFBFF", "#B3F2FF", "#99E6FF", "#80D4FF", "#66BFFF", "#4DA6FF", "#3388FF", "#1A66FF", "#0040FF"]);

    var defaultBubbleColor = "#990F0F";
    var notSureColor = "#777";
    var mapContainer;
    var projection;
    var independetColors = d3.scale.category10();

    $(window).resize(_.debounce(function () {
        w = $("#visualizationContent").width(), h = $("#visualizationContent").height() - $("#top-bar").height() - 1;
        clearCanvas();
        svg.attr("width", w)
            .attr("height", h);

        if ($("#listQuestions").find(".active").length > 1) {
            var element = $("li.active .btnAdd").first();
            onAddRow(element);
            return;
        }

        if (view == "percentage") {
            drawTable();
            if ($("#listQuestions").find(".active").length > 0) {
                updatePercentageView();
            }
        }
        else if (view == "mean") {
            updateMeanView();
        }
        else if (view=="heatmap"){
            drawOuterRect();
            drawGradientBackground(0);
            updateHeatMap();
        }
    }, 500));

    d3.selection.prototype.moveToBack = function () {
        return this.each(function () {
            var firstChild = this.parentNode.firstChild;
            if (firstChild) {
                this.parentNode.insertBefore(this, firstChild);
            }
        });
    };

    d3.selection.prototype.moveToFront = function () {
        return this.each(function () {
            this.parentNode.appendChild(this);
        });
    };

    // Multiple choices (s:select one, m:select multiple) - Single choice group - Single choice
    var regExp = {multipleQuestionSelectOne: /^Q([0-9]+)([a-z])/, singleChoice: /^Q([0-9])/};
    var infoQuestions = {};

    self.loadData = function () {
        $.ajax(self.dataFile, {
            success: function (csvData) {
                data = csvjson.csv2json(csvData);
                $.ajax(self.metadataFile, {
                    success: function (csvMetaData) {
                        metadata = csvjson.csv2json(csvMetaData);
                        self.drawPivotView();
                    },
                    error: function () {
                        console.log("Failed to load metadata csv file");
                    }
                });
            },
            error: function () {
                console.log("Failed to load data csv file");
            }
        });
    };

    self.drawPivotView = function () {
        loadQuestions();
        initializeGraph();
        if (!localStorage.getItem("hideTips")){
            loadTips();
        }
    };

    // Returns the cell value given a question ID and the name of the column
    function getValue(questionID, label) {
        for (var i = 0; i < metadata.rows.length; i++) {
            if (metadata.rows[i]["ID"] == questionID) {
                for (var prop in metadata.rows[i]) {
                    if (metadata.rows[i][prop] == label) {
                        return prop;
                    }
                }
                return 0;
            }
        }
    }

    function getLabel(question, value) {
        for (var j = 0; j < metadata.rows.length; j++) {
            var reGetQuestionID = /Q[0-9]+[a-z]*/;
            var questionID = reGetQuestionID.exec(metadata.rows[j]["Variable"]);
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

    function initializeGraph() {
        radius_scale = d3.scale.pow().exponent(0.5).domain([0, data.rows.length - 1]).range([2, 85]);

        // Get the list of demographic questions
        for (var j = 0; j < metadata.rows.length; j++) {
            var questionID = metadata.rows[j]["Variable"].trim();
            var questionLabel = metadata.rows[j]["VariableLabel"].trim();
            var pluggins = getCellContent(questionID, "Features").split(";");
            for (var i = 0; i < pluggins.length; i++) {
                if (pluggins[i].trim() == "isDemographic") {
                    infoQuestions[questionLabel] = questionID;
                    $("#lstYAxisMode").append('<li><a data-axis="' + questionLabel + '" href="#">' + questionLabel + '</a></li>');  // Add demographic items to dropdown
                }
            }
        }

        // Populate demographic data on the nodes
        nodes = d3.range(data.rows.length).map(function (d, i) {
            var info = {};
            for (var j = 0; j < metadata.rows.length; j++) {
                var questionID = metadata.rows[j]["Variable"].trim();
                var questionLabel = metadata.rows[j]["VariableLabel"].trim();
                var pluggins = getCellContent(questionID, "Features").split(";");
                for (var p = 0; p < pluggins.length; p++) {
                    if (pluggins[p].trim() == "isDemographic") {
                        info[questionLabel] = data.rows[i][questionID];
                    }
                }
            }

            return {value: 0, info: info, temp: false, tempPosY: 0};
        });

        svg = d3.select("#visualizationContent").append("svg:svg")
            .attr("width", w)
            .attr("height", h);

        mapContainer = svg.append("g")
            .attr("class", "map-container")
            .call(mapZoom)
            .append("g");

        $("map-container").hide();
        $("#btnCategories")[0].disabled = true;
        loadHeatMap();
        setPercentageView();    // start the site in percentage view

        // Bind click events
        $("#percentage-view").click(setPercentageView);
        $("#map-view").click(setHeatMapView);
        $("#mean-view").click(setMeanView);

        $('#listQuestions .clickable').click(onListQuestionClick);
        $('#listQuestions li').click(onListQuestionClick);
        $('#lstYAxisMode li:not(.disabled)').click(onYAxisModeChange);
        $("#lstYAxisMode li:first-child").addClass("disabled"); // Start with the selected category disabled
        $(".btnAdd").click(onBtnAddClick);
        $(".btnSubstract").click(onBtnSubstractClick);
        $(".btn-tip").click(onNextTip);
        $("#btnSkipTips").click(finishGuide);
        $("#chkHideTip").click(function(e){
            localStorage.setItem("hideTips", e.target.checked);
        });

    }

    function loadTips (){
        var pageWidth = $("body").width();
        var pageHeight = $("body").height();
        tips = [
            {
                title:"Welcome!",
                message:"Please take a moment to read these useful tips.",
                top:pageHeight/2 - 100,
                left:pageWidth/2 - 150,
                arrow:""
            },
            {
                title:"1/3",
                message:"Plot data by clicking items from the list of questions. Use '+' signs to aggregate multiple questions.",
                top:310,
                left:310,
                arrow:"arrow_left"
            },
            {
                title:"2/3",
                message:"Use these buttons to chose between different views to display your data.",
                top:175,
                left:pageWidth - 342,
                arrow:"arrow_top_right"
            },
            {
                title:"3/3",
                message:"Chose between predefined demographic categories to see how your data compares among groups of respondents.",
                top:215,
                left:195,
                arrow:"arrow_top"
            }];

        $("#btnPreviousTip")[0].disabled = true;
        $("#tip").text(tips[0].message);
        $("#tip-title").text(tips[0].title);

        var window = $("#arrowWindow");
        window.removeClass("arrow_right");
        window.removeClass("arrow_top");
        window.removeClass("arrow_left");
        window.removeClass("arrow_bottom");
        window.removeClass("arrow_top_right");

        window.addClass(tips[0].arrow);
        window[0].style.left = tips[0].left + "px";
        window[0].style.top = tips[0].top + "px";
        $("#btnGuide").click();
    }

    function finishGuide(){
        $("#btnNextTip")[0].setAttribute("data-count", "1");
        $("#btnPreviousTip")[0].setAttribute("data-count", "0");
        $(".modal-backdrop")[0].style.opacity = "0.5";
        $('#guideModal').modal('hide');
        return;
    }

    function onNextTip(e){
        var show = parseInt(e.target.getAttribute("data-count"));

        if ($(e.target).text() == "Finish"){
            finishGuide();
            return;
        }

        var window = $("#arrowWindow");
        window.removeClass("arrow_right");
        window.removeClass("arrow_top");
        window.removeClass("arrow_left");
        window.removeClass("arrow_bottom");
        window.removeClass("arrow_top_right");

        window.addClass(tips[show].arrow);
        $("#tip").text(tips[show].message);
        $("#tip-title").text(tips[show].title);
        window[0].style.left = tips[show].left + "px";
        window[0].style.top = tips[show].top + "px";

        if (show > 0){
            $("#btnPreviousTip")[0].disabled = false;

        }
        else{
            $("#btnPreviousTip")[0].disabled = true;
        }

        $("#btnPreviousTip")[0].setAttribute("data-count", String(show - 1));
        $("#btnNextTip")[0].setAttribute("data-count", String(show + 1));

        if (show > tips.length - 2) {
            $("#btnNextTip").text("Finish");
        }
        else {
            $("#btnNextTip").text("Next");
        }
    }

    function onListQuestionClick(e) {
        var that = $(e.target).closest(".clickable").length > 0 ? $(e.target).closest(".clickable") : $(e.target).find(".clickable");

        // Prevents the event from triggering twice with the same question or triggering when the button is disabled
        if (that.length == 0 || that[0].getAttribute("data-value") == selectedQuestion || that.hasClass("disabled")) {
            return;
        }

        if (that.length == 0) {
            return;
        }

        $("#btnCategories")[0].disabled = false;
        $("#map-view")[0].disabled = false;
        $("#mean-view")[0].disabled = false;
        $("#percentage-view")[0].disabled = false;

        // Refresh y-axis mode
        numberOfQuestions = 1;
        restoreYAxisMode();

        $('#listQuestions li').removeClass("active");
        that.closest("li").addClass("active");
        selectedQuestion = that.attr("data-value");

        var title = getCellContent(selectedQuestion, "VariableLabel");

        var content = getCellContent(selectedQuestion, "SubVariableLabel")

        // Toggle add button visibility
        $(".btnAdd").hide();
        $(".btnSubstract").hide();
        removeTempNodes();

        if ($(this.parentElement).hasClass("indented")) {
            $(this.parentElement.parentElement).find(".btnAdd").show();
            $(this.parentElement).find(".btnAdd").hide();
        }
        else {
            $(".btnAdd").hide();
        }

        // Toggle Title visibility
        $("#txtDescription").text("");
        $("#txtTitle").text(title);
        if ($("#txtTitle").text() == "") {
            $(".titleContainer").hide();
        }
        else {
            $(".titleContainer").show();
        }
        $("#txtDescription").text(content);
        if ($("#txtDescription").text() == "") {
            $(".descriptionContainer").hide();
        }
        else {
            $(".descriptionContainer").show();
        }

        if (hasPluggin(selectedQuestion, "unidirectional") || hasPluggin(selectedQuestion, "bidirectional")) {
            $("#map-view")[0].disabled = false;
            $("#mean-view")[0].disabled = false;
        }
        else {
            $("#map-view")[0].disabled = true;
            $("#mean-view")[0].disabled = true;
        }

        if (view == "percentage") {
            drawTable();
            updatePercentageView();
        }
        else if (view == "heatmap") {
            $(".btnAdd").hide();
            updateHeatMap();
        }
        else if (view == "mean") {
            updateMeanView();
        }
    }

    function getQuestionColors(){
        if (hasPluggin(selectedQuestion, "bidirectional")) {
            return bidirectionalScale;
        }
        return unidirectionalScale;
    }

    function drawMeanViewTable() {
        clearCanvas();

        var y = d3.scale.linear()
            .domain([0, options.length])
            .range([0, h - margin.bottom - margin.top]);

        drawYAxisLegend(y);

        var marginLeft = getYLabelSize() + yPanelWidth;

        var x = d3.scale.linear()
            .domain([0, answers.length])
            .range([0, w - marginLeft]);

        drawOuterRect();
        drawYAxisPanel();

        //drawHorizontalLines(y);
        drawGrayAlternation(y);

        // Draw x axis legend and ignore not sure responses
        var value = $(".active label").attr("data-value");
        var deltaX = (x(1) - x(0));
        var deltaY = y(1) - y(0);

        for (var j = 0; j < metadata.rows.length; j++) {
            var questionID = metadata.rows[j]["Variable"];
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

                // Draw x-axis legend
                for (var i = 0; i < answers.length; i++) {
                    if (labelsArray[answers[i]] != "not sure") {
                        svg.append("text")
                            .attr("dx", 0)
                            .attr("dy", 0)
                            .attr("class", "x-legend graph-object")
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
        drawGradientBackground(marginLeft);
        // Draw vertical dotted lines
        for (var i = 1; i < answers.length + 1; i++) {
            if ((answers[i - 1] && labelsArray[answers[i - 1]] != "not sure") || answers.length == 1) {
                svg.append("svg:line")
                    .attr("x1", x(i) + marginLeft - deltaX / 2)
                    .attr("x2", x(i) + marginLeft - deltaX / 2)
                    .attr("y1", margin.top)
                    .attr("y2", h - margin.bottom)
                    .attr("class", "vertical-mean-line graph-object")
                    .attr("stroke-dasharray", "1, 5")
                    .attr("stroke-linecap", "round")
                    .style("stroke", tableColor)
            }
        }

        // Line at the top of x axis legend
        svg.append("svg:line")
            .attr("x1", 0)
            .attr("x2", w)
            .attr("y1", h - margin.bottom)
            .attr("y2", h - margin.bottom)
            .attr("class", "horizontal-line graph-object")
            .style("stroke", tableColor)
            .style("stroke-width", "1.3px");

        var colorScale = getQuestionColors();

        var colorData = [];
        var stops = $(".vertical-mean-line").length - 1;
        for (var i = 0; i <= stops; i++) {
            var offset = i * 100 / stops;
            colorData.push({offset: offset + "%", color: colorScale(offset / 100)})
        }

        var left = yPanelWidth + deltaX / 2 + getYLabelSize();
        var right = w - deltaX / 2;

        $("defs").remove();
        $("linearGradient").remove();

        x = d3.scale.linear()
            .domain([1, answers.length])
            .range([left, right]);

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
        for (var i = 1; i <= options.length; i++) {
            svg.append("svg:rect")
                .attr("width", x(answers.length) - x(1))
                .attr("height", "40")
                .attr("x", x(1))
                .attr("y", y(i) - deltaY / 2)
                .style("stroke", "#777")
                .style("stroke-width", "1px")
                .style("fill", "url(#line-gradient)")
                //.style("opacity", 0.75)
                .attr("transform", "translate(" + 0 + "," + (-20) + ")")
                .attr("class", "mean-base-line graph-object");

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
                if (getLabel(selectedQuestion, d.value) == "not sure") {
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
                if ($("#gradient0").length == 0) {
                    getGradient("#888", 0);
                }
                // Draw mean
                var xCord = (nodeRows[i - 1].total) / nodeRows[i - 1].participants;

                var top = y(i) - deltaY / 2 - 40;

                var currLine = svg.append("svg:rect")
                    .attr("width", "20")
                    .attr("height", "80")
                    .attr("x", (left + right) / 2)
                    .attr("class", "vertical-mean-line graph-object")
                    .style("stroke", d3.rgb("#888").darker(2))
                    .style("fill", 'url(#gradient0)')
                    .style("stroke-width", "1px")
                    .attr("transform", "translate(" + 0 + "," + top + ")");

                currLine.transition()
                    .duration(400)
                    .ease("linear")
                    .attr("x", (x(xCord) - 10))
            }
        }

        drawLegendContainers(marginLeft);

    }

    function updateMeanView() {
        refreshValues();
        drawMeanViewTable();
    }

    function updateHeatMap() {
        refreshValues();
        var responses = _.map(nodes, function (a, b) {
            for (var prop in data.rows[b]) {
                if (prop.trim() == spatialQuestion)
                    return {zipcode: data.rows[b][prop], value: data.rows[b][selectedQuestion]};
            }
        });

        var numberOfAnswers = answers.length;

        // Substract "Not sure" answers
        for (var i = 0; i < answers.length; i++) {
            var label = getLabel(selectedQuestion, answers[i]);
            if (label && label.trim() == "not sure") {
                responses = _.filter(responses, function (resp) {
                    return resp.value != i + 1;
                });
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

        // Reset background and hover functions for all paths
        var paths = d3.selectAll('path[data-zip]');
        paths.on("mouseover", function (d) {
            var content = "<span class=\"name\">" + d.properties.NAME + "</span><span class=\"value\"></span><br/>" +
                "<span class=\"name\">Zip code: </span><span class=\"value\">" + d.properties.ZIP5 + "</span><br/>";
            tooltip.showTooltip(content, d3.event);
        });

        var colorScale = getQuestionColors();

        var maxParticipants = _.max(participants, function(o){return o;});

        for (var zip in totals) {
            var curPath = d3.select('path[data-zip="' + zip + '"]');
            if (curPath[0][0] != null) {
                curPath.on("mouseover", function (obj) {
                    var zip = obj.properties.ZIP5;
                    var content = "<span class=\"name\">" + obj.properties.NAME + "</span><span class=\"value\"></span><br/>" +
                        "<span class=\"name\">Zip code: </span><span class=\"value\">" + zip + "</span><br/>" +
                            //"<span class=\"name\">Avg: </span><span class=\"value\">" + parseFloat((totals[zip] / participants[zip])).toFixed(2) + "</span><br/>" +
                        "<span class=\"name\">Participants: </span><span class=\"value\">" + participants[zip] + "</span><br/>";
                    tooltip.showTooltip(content, d3.event);
                });
                // Map refresh animation
                curPath.transition().duration(100).attr("fill", "#3D4348");

                if (participants[zip] > cutoff) {        // Cut off at 5
                    if ($("li.active").length && !hasPluggin(selectedQuestion, "spatial")) {
                        curPath.transition().duration(500).delay(100).attr("fill", function (d) {
                            return colorScale((totals[zip] / participants[zip]) / numberOfAnswers);
                        });
                    }
                    else{
                        // When no questions selected, display gradient based on number of participants
                        curPath.transition().duration(500).delay(100).attr("fill", function (d) {
                            return unidirectionalScale(participants[zip] / maxParticipants);
                        });
                    }
                }

            }
            else {
                //console.log("Warning: path not found for zip code " + zip + " which contains " + participants[zip] + " participants.");
            }
        }

        // Update legend
        if (!$("li.active").length || hasPluggin(selectedQuestion, "spatial")) {
            numberOfAnswers = 5;                // 2 labels: Min and max number of participants
            colorScale = unidirectionalScale;
        }

        if (hasPluggin(selectedQuestion, "spatial")){
            $("#percentage-view")[0].disabled = true;
        }

        var colorData = [];
        for (var i = 0; i <= numberOfAnswers; i++) {
            var offset = i * 100 / numberOfAnswers;
            colorData.push({offset: offset + "%", color: colorScale(offset / 100)});
        }

        var rHeight = numberOfAnswers * (20 + 12);
        var rWidth = 300;

        svg.select(".heat-map-legend").remove();
        var heatMapLegendArea = svg.append("g")
            .attr("transform", "translate(" + (w - rWidth) + "," + (h - rHeight - margin.top) + ")")
            .attr("class", "heat-map-legend graph-object");

        // Append background for legend container
        heatMapLegendArea.append("svg:rect")
            .attr("width", rWidth)
            .attr("height", rHeight)
            .attr("class", "heat-map-legend-rect")
            .style("fill", "#FFF")
            .style("stroke", "#000")
            .style("stroke-width", "1px")
            .style("opacity", 0.75);

        // Append the gradient
        var verticalSpacing = 18;
        $("linearGradient").remove();
        svg.append("linearGradient")
            .attr("id", "line-gradient")
            .attr("gradientUnits", "userSpaceOnUse")
            .attr("x1", 0).attr("y1", 10)
            .attr("x2", 0).attr("y2", rHeight - verticalSpacing)
            .selectAll("stop")
            .data(colorData)
            .enter().append("stop")
            .attr("offset", function (d) {
                return d.offset;
            })
            .attr("stop-color", function (d) {
                return d.color;
            });

        // Gradient legend
        heatMapLegendArea.append("svg:rect")
            .attr("width", 30)
            .attr("height", rHeight - verticalSpacing * 2)
            .attr("x", 10)
            .attr("y", verticalSpacing)
            .style("stroke", "#777")
            .style("stroke-width", "1px")
            .style("fill", "url(#line-gradient)")
            .attr("class", "graph-object");

        if ($("li.active").length && !hasPluggin(selectedQuestion, "spatial")) {
            var counter = 0;
            for (var i = 0; i < numberOfAnswers; i++) {
                var label = getLabel(selectedQuestion, answers[i]);
                if (label)
                    label = label.trim();
                if (label != "not sure") {
                    if (label != null){
                        var legendText = heatMapLegendArea.append("svg:text")
                            .attr("y", (counter * 30) + 20)
                            .attr("dy", ".31em")
                            .attr("class", "hm-legend")
                            .style("fill", "#000")
                            .text(label)
                            .call(wrap, rWidth - 60);
                        heatMapLegendArea.append("svg:text")
                            .attr("x", 40)
                            .attr("y", (counter * 30) + 20)
                            .attr("dy", ".31em")
                            .attr("class", "hm-legend")
                            .style("fill", "#AAA")
                            .text("—");
                    }

                    legendText.attr("transform", "translate(" + 60 + "," + 0 + ")")
                    counter++;
                }
            }
        }
        else{
            heatMapLegendArea.append("svg:text")
                .attr("x", 60)
                .attr("y", 20)
                .attr("dy", ".31em")
                .attr("class", "hm-legend")
                .style("fill", "#000")
                .text("5 participants");

            heatMapLegendArea.append("svg:text")
                .attr("x", 40)
                .attr("y", 20)
                .attr("dy", ".31em")
                .attr("class", "hm-legend")
                .style("fill", "#AAA")
                .text("—");

            heatMapLegendArea.append("svg:text")
                .attr("x", 60)
                .attr("y", (4 * 30) + 20)
                .attr("dy", ".31em")
                .attr("class", "hm-legend")
                .style("fill", "#000")
                .text(maxParticipants + " participants")

            heatMapLegendArea.append("svg:text")
                .attr("x", 40)
                .attr("y", (4 * 30) + 20)
                .attr("dy", ".31em")
                .attr("class", "hm-legend")
                .style("fill", "#AAA")
                .text("—");
        }
    }

    function enableDimensionalQuestions() {
        var items = $(".clickable");
        for (var i = 0; i < items.length; i++) {
            var question = items[i].getAttribute("data-value").trim();
            if (!hasPluggin(question, "unidirectional") && !hasPluggin(question, "bidirectional") && !hasPluggin(question, "spatial")) {
                $(items[i]).addClass("disabled");
            }
        }
    }

    function enableSpatialQuestions(){
        var items = $(".clickable");
        for (var i = 0; i < items.length; i++) {
            var question = items[i].getAttribute("data-value").trim();
            if (hasPluggin(question, "spatial")) {
                $(items[i]).removeClass("disabled");
            }
        }
    }

    function disableSpatialQuestions(){
        var items = $(".clickable");
        for (var i = 0; i < items.length; i++) {
            var question = items[i].getAttribute("data-value").trim();
            if (hasPluggin(question, "spatial")) {
                $(items[i]).addClass("disabled");
            }
        }
    }
    function showAllQuestions() {
        $(".clickable").removeClass("disabled");
    }

    function onBtnSubstractClick(e) {
        $(this).closest("li").removeClass("active");
        $(this).hide();
        $(this).parent().find(".btnAdd").show();
        onAddRow($(this));
    }

    function onBtnAddClick(e) {
        $(this).closest("li").addClass("active");
        $(this).hide();
        $(this).parent().find(".btnSubstract").show();
        onAddRow($(this));
    }

    function restoreYAxisMode() {
        var mode = $("#lstYAxisMode .disabled a")[0].getAttribute("data-axis");
        yAxisMode = mode;
    }

    // Custom draws for multiple question selection feature
    function onAddRow(element) {
        yAxisMode = "";
        numberOfQuestions = element.parent().parent().find(".active").length;

        // Load labels for y-axis
        var labels = element.parent().parent().find(".active .clickable");
        for (var i = 0; i < labels.length; i++) {
            labels[i] = $(labels[i]).text();
        }

        // Add a set of nodes for each selected question
        removeTempNodes();
        var nodesCopy = nodes.slice();
        var tempQuestions = element.parent().parent().find(".active .clickable");

        // Get list of selected questions
        for (var i = 0; i < labels.length; i++) {
            tempQuestions[i] = tempQuestions[i].getAttribute("data-value");
        }

        questionNodes = [];

        for (var j = 0; j < tempQuestions.length; j++) {
            questionNodes[j] = [];
            for (var i = 0; i < nodesCopy.length; i++) {
                var tempNode = {
                    value: data.rows[i][tempQuestions[j]],
                    info: nodesCopy[i].info,
                    temp: true,
                    tempPosY: j
                }
                questionNodes[j].push(tempNode);
            }
        }

        if (numberOfQuestions > 1) {
            // Show substract button for this item
            element.parent().parent().find(".active .clickable").parent().find(".btnSubstract").show();
            $("#btnCategories")[0].disabled = true;
            $("#map-view")[0].disabled = true;
        }
        else {
            $(".btnSubstract").hide();

            restoreYAxisMode();
            $("#btnCategories")[0].disabled = false;
            $("#map-view")[0].disabled = false;
            $("#mean-view")[0].disabled = false;
        }

        clearCanvas();
        refreshValues();

        var y = d3.scale.linear()
            .domain([0, options.length])
            .range([0, h - margin.bottom - margin.top]);

        if (numberOfQuestions > 1) {
            // Draw y-axis legend
            for (var i = 0; i < numberOfQuestions; i++) {
                svg.append("text")
                    .attr("class", "y-legend graph-object")
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

                //Center y axis legend
                var deltaY = y(1) - y(0);
                var height = $("#y-legend" + i)[0].getBBox().height;
                $("#y-legend" + i).attr("y", ((h - margin.bottom) / (options.length)) * i + deltaY / 2 - height / 2);
            }
        }
        else {
            drawYAxisLegend(y);
            $("#txtDescription").text(element.parent().parent().find(".active .clickable").text());
        }

        var marginLeft = getYLabelSize() + yPanelWidth;

        var x = d3.scale.linear()
            .domain([0, answers.length])
            .range([0, w - marginLeft]);

        // Draw stuff
        drawOuterRect();
        drawGrayAlternation(y);
        drawGradientBackground(marginLeft)
        drawLegendContainers(marginLeft);
        drawYAxisPanel();
        drawXAxisLegend(marginLeft, x);

        if (view == "percentage"){
            drawVerticalLines(marginLeft, x);
            drawHorizontalLines(y, marginLeft);
        }
        else{
            // Line at the top of x axis legend
            svg.append("svg:line")
                .attr("x1", 0)
                .attr("x2", w)
                .attr("y1", h - margin.bottom)
                .attr("y2", h - margin.bottom)
                .attr("class", "horizontal-line graph-object")
                .style("stroke", tableColor)
                .style("stroke-width", "1.3px")
        }

        if (view == "percentage"){
            updatePercentageView();
        }
        else if(view == "mean"){
            var deltaX = x(1) - x(0);
            var value = $(".active label").attr("data-value");
            for (var i = 1; i < answers.length + 1; i++) {
                // Get the list of labels
                for (var j = 0; j < metadata.rows.length; j++) {
                    var questionID = metadata.rows[j]["Variable"];
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
                    }
                }
            }

            for (var i = 1; i < answers.length + 1; i++) {
                // Draw vertical dotted lines
                if ((answers[i - 1] && labelsArray[answers[i - 1]] != "not sure") || answers.length == 1) {
                    svg.append("svg:line")
                        .attr("x1", x(i) + marginLeft - deltaX / 2)
                        .attr("x2", x(i) + marginLeft - deltaX / 2)
                        .attr("y1", margin.top)
                        .attr("y2", h - margin.bottom)
                        .attr("class", "vertical-mean-line graph-object")
                        .attr("stroke-dasharray", "1, 5")
                        .attr("stroke-linecap", "round")
                        .style("stroke", tableColor)
                }
            }

             var left = yPanelWidth + deltaX / 2 + getYLabelSize();
            var right = w - deltaX / 2;
            var colorScale = getQuestionColors();
            var colorData = [];
            var stops = $(".vertical-mean-line").length - 1;
            for (var i = 0; i <= stops; i++) {
                var offset = i * 100 / stops;
                colorData.push({offset: offset + "%", color: colorScale(offset / 100)})
            }

            $("defs").remove();
            $("linearGradient").remove();

            x = d3.scale.linear()
                .domain([1, answers.length])
                .range([left, right]);

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

            // Draw mean base lines
            var deltaY = y(1) - y(0);
            for (var i = 1; i <= options.length; i++) {
                svg.append("svg:rect")
                    .attr("width", x(answers.length) - x(1))
                    .attr("height", "40")
                    .attr("x", x(1))
                    .attr("y", y(i) - deltaY / 2)
                    .style("stroke", "#777")
                    .style("stroke-width", "1px")
                    .style("fill", "url(#line-gradient)")
                    //.style("opacity", 0.75)
                    .attr("transform", "translate(" + 0 + "," + (-20) + ")")
                    .attr("class", "mean-base-line graph-object");
            }

            // ---------- Draw means ----------------------
            var nodeRows = d3.range(options.length).map(function (i) {
                return {
                    total: 0,
                    participants: 0,
                    y: i
                };
            });

            for (var i = 0; i < questionNodes.length; i++) {
                for (var j = 0; j < questionNodes[i].length; j++) {
                    var d = questionNodes[i][j];
                    var posOption = ($.inArray(d.info[yAxisMode], options));
                    if (yAxisMode == "") {
                        posOption = d.tempPosY;
                    }
                    else if (yAxisMode == "All"){
                        posOption = 0;
                    }
                    var val = d.value;
                    if (labelsArray[d.value] != "not sure") {
                        nodeRows.forEach(function (o) {
                            if (o.y == posOption) {
                                o.participants++;
                                o.total += val;
                            }
                        });
                    }
                }
            }

            // Draw actual mean
            for (var i = 1; i <= options.length; i++) {
                if ($("#gradient0").length == 0) {
                    getGradient("#888", 0);
                }
                // Draw mean
                var xCord = (nodeRows[i - 1].total) / nodeRows[i - 1].participants;

                var top = y(i) - deltaY / 2 - 40;

                var currLine = svg.append("svg:rect")
                    .attr("width", "20")
                    .attr("height", "80")
                    .attr("x", (left + right) / 2 - 10)
                    .attr("class", "vertical-mean-line graph-object")
                    .style("stroke", d3.rgb("#888").darker(2))
                    .style("fill", 'url(#gradient0)')
                    .style("stroke-width", "1px")
                    .attr("transform", "translate(" + 0 + "," + top + ")");

                currLine.transition()
                    .duration(400)
                    .ease("linear")
                    .attr("x", (x(xCord) - 10))
            }
        }
    }


    function removeTempNodes() {
        questionNodes = [];
    }

    function onYAxisModeChange(e) {
        if (e.target.getAttribute("data-axis") == yAxisMode) {
            return;
        }
        $("#lstYAxisMode li").removeClass("disabled");
        $(this).addClass("disabled");
        yAxisMode = e.target.getAttribute("data-axis");
        // $("#btnCategories").text(yAxisMode);
        drawTable();

        if (view == "heatmap") {

        }
        else if (view == "percentage") {

            updatePercentageView();
        }
        else if (view == "mean") {
            updateMeanView();
        }
    }

    function setMeanView() {
        $("#percentage-view").removeClass("disabled");
        $("#map-view").removeClass("disabled");
        $("#mean-view").addClass("disabled");
        $("#significance-flag-container").hide();

        view = "mean";

        $(".map-container").hide();
        $(".heat-map-legend").hide();
        $(".zoom-controls").hide();
        //$("#btnCategories")[0].disabled = true;
        $("#btnCategories").show();
        enableDimensionalQuestions();
        disableSpatialQuestions();

        // If a question has been clicked, update
        if ($("#listQuestions").find(".active").length > 1){
            var element =  $("li.active .btnAdd").first();
            onAddRow(element);
        }
        else if ($("#listQuestions").find(".active").length > 0){
            var element = $("li.active .btnAdd").first();
            if (element.length) {
                $(element[0].parentElement.parentElement).find(".btnAdd").show();
                element.hide();
            }
            updateMeanView();
        }
    }

    function setPercentageView() {
        if (view == "percentage")
            return;

        view = "percentage";
        $(".map-container").hide();
        $(".heat-map-legend").hide();
        $(".zoom-controls").hide();

        $("#percentage-view").addClass("disabled");
        $("#map-view").removeClass("disabled");
        $("#mean-view").removeClass("disabled");

        $("#btnCategories").show();

        //$("#btnCategories")[0].disabled = false;

        drawTable();

        showAllQuestions();
        disableSpatialQuestions();

        // If a question has been clicked, update

        if ($("#listQuestions").find(".active").length > 1){
            var element =  $("li.active .btnAdd").first();
            onAddRow(element);

        }
        else if ($("#listQuestions").find(".active").length > 0){
            var element =  $("li.active .btnAdd").first();
            if (element.length){
                $(element[0].parentElement.parentElement).find(".btnAdd").show();
                element.hide();
            }

            updatePercentageView();
        }
    }

    function clearCanvas() {
        //svg.selectAll("*:not(.map-container)").remove();
        svg.selectAll(".graph-object").remove();
    }

    function setHeatMapView() {
        view = "heatmap";

        $("#map-view").addClass("disabled");
        $("#percentage-view").removeClass("disabled");
        $("#mean-view").removeClass("disabled");
        $("#significance-flag-container").hide();

        clearCanvas();

        $(".map-container").show();
        $(".heat-map-legend").show();
        $(".zoom-controls").show();

        enableDimensionalQuestions();
        enableSpatialQuestions();

        $(".btnAdd").hide();
        $("#btnCategories").hide();

        drawOuterRect();
        drawGradientBackground(0);

        updateHeatMap();
    }

    function loadHeatMap() {
        queue()
            .defer(d3.json, self.zipcodesFile)
            .await(plotZipCodes);

        function plotZipCodes(error, us) {
            //var zipCodes = _.map(nodes, function(a, b){return {zipcode:data.rows[b + 1][spatialQuestion]}});
            //zipCodes = _(zipCodes).countBy("zipcode");

            // create a first guess for the projection
            var center = d3.geo.centroid(topojson.feature(us, us.objects.zip_codes_for_utah))
            var scale = 6500;
            var offset = [w / 2, (h - 20) / 2];
            projection = d3.geo.mercator()
                .scale(scale)
                .center(center)
                .translate(offset);

            // create the path
            path = d3.geo.path().projection(projection);

            // using the path determine the bounds of the current map and use
            // these to determine better values for the scale and translation
            var bounds = path.bounds(topojson.feature(us, us.objects.zip_codes_for_utah));
            var hscale = scale * w / (bounds[1][0] - bounds[0][0]);
            var vscale = scale * (h - 20) / (bounds[1][1] - bounds[0][1]);
            var scale2 = (hscale < vscale) ? hscale : vscale;
            var offset2 = [w - (bounds[0][0] + bounds[1][0]) / 2,
                (h - 20) - (bounds[0][1] + bounds[1][1]) / 2 + 10];

            // new projection
            projection = d3.geo.mercator().center(center)
                .scale(scale2).translate(offset2);

            path = path.projection(projection);

            // Append polygons for zip codes
            mapContainer.append("g")
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
                    var content = "<span class=\"name\">" + d.properties.NAME + "</span><span class=\"value\"></span><br/>" +
                        "<span class=\"name\">Zip code: </span><span class=\"value\">" + d.properties.ZIP5 + "</span><br/>";
                    tooltip.showTooltip(content, d3.event);
                    this.parentNode.appendChild(this);
                })
                .on("mouseout", function () {
                    tooltip.hideTooltip();
                })
                .attr("class", "zip-path")
                .attr("fill", "#3D4348")
                .attr("d", path);

            $("#loadingScreen").fadeOut().remove();
        }

        // Zoom controls
        var zoomControls = svg.append("g")
            .attr("width", "30px")
            .attr("fill", "#FFF")
            .attr("y", "15px")
            .attr("x", "15px")
            .attr("class", "zoom-controls");

        // White background button area
        zoomControls.append("rect")
            .attr("width", "30px")
            .attr("height", "30px")
            .attr("y", "15px")
            .attr("x", "15px");

        zoomControls.append("rect")
            .attr("width", "30px")
            .attr("height", "30px")
            .attr("y", "50px")
            .attr("x", "15px");

        // Buttons
        zoomControls.append("rect")
            .attr("width", "30px")
            .attr("height", "30px")
            .attr("class", "zoom_in")
            .attr("y", "15px")
            .attr("x", "15px")
            .style("stroke", "#000")
            .on("click", zoomClick);

        zoomControls.append("rect")
            .attr("width", "30px")
            .attr("height", "30px")
            .attr("class", "zoom_out")
            .attr("y", "50px")
            .attr("x", "15px")
            .style("stroke", "#000")
            .on("click", zoomClick);

        // + Sign
        zoomControls.append("text")
            .attr("dx", "30px")
            .attr("dy", "38px")
            //.attr("class", "noselect")
            .style("font-size", "26px")
            .attr("class", "zoom_in")
            .attr("text-anchor", "middle")
            .attr("font-weight", "normal")
            .style("fill", tableColor)
            .text("+")
            .on("click", zoomClick);

        // - Sign
        zoomControls.append("text")
            .attr("dx", "30px")
            .attr("dy", "73px")
            .style("font-size", "26px")
            .attr("class", "zoom_out")
            .attr("text-anchor", "middle")
            .attr("font-weight", "normal")
            .style("fill", tableColor)
            .text("-")
            .on("click", zoomClick);
    }

    function interpolateZoom(translate, scale) {
        return d3.transition().duration(350).tween("zoom", function () {
            var iTranslate = d3.interpolate(mapZoom.translate(), translate),
                iScale = d3.interpolate(mapZoom.scale(), scale);
            return function (t) {
                mapZoom
                    .scale(iScale(t))
                    .translate(iTranslate(t));
                zoom();
            };
        });
    }

    function zoomClick() {
        var clicked = d3.event.target,
            direction = 1,
            factor = 0.5,
            target_zoom = 1,
            center = [w / 2, h / 2],
            extent = mapZoom.scaleExtent(),
            translate = mapZoom.translate(),
            translate0 = [],
            l = [],
            view = {x: translate[0], y: translate[1], k: mapZoom.scale()};

        d3.event.preventDefault();
        direction = (this.classList[0] == "zoom_in") ? 1 : -1;
        target_zoom = mapZoom.scale() * (1 + factor * direction);

        target_zoom = Math.min(target_zoom, extent[1]);
        target_zoom = Math.max(target_zoom, extent[0]);

        translate0 = [(center[0] - view.x) / view.k, (center[1] - view.y) / view.k];
        view.k = target_zoom;
        l = [translate0[0] * view.k + view.x, translate0[1] * view.k + view.y];

        view.x += center[0] - l[0];
        view.y += center[1] - l[1];

        interpolateZoom([view.x, view.y], view.k);
    }

    function zoom() {
        mapContainer.attr("transform", "translate(" + mapZoom.translate() + ")scale(" + mapZoom.scale() + ")");

        d3.selectAll(".zip-path")
            .style("stroke-width", (1 / mapZoom.scale()) + "px")
    }

    function refreshValues() {
        // Add fixed nodes
        var valuesY = [];
        var valuesX = [];

        if (questionNodes.length < 2) {
            for (var i = 0; i < data.rows.length; i++) {
                nodes[i].value = data.rows[i][selectedQuestion];
                if (nodes[i].value == 0 || nodes[i].info[yAxisMode] == "No response" || nodes[i].info[yAxisMode] == 0) {
                    continue;
                }
                valuesX.push(nodes[i].value);
                valuesY.push(data.rows[i][infoQuestions[yAxisMode]]);
            }

            options = valuesY.getUnique().sort(function (a, b) {
                return b - a
            });
        }
        else {
            // Add data when multiple questions are selected
            for (var j = 0; j < questionNodes.length; j++) {
                for (var i = 0; i < data.rows.length; i++) {
                    if (questionNodes[j][i].value == 0 || questionNodes[j][i].info[yAxisMode] == "No response" || questionNodes[j][i].info[yAxisMode] == 0) {
                        continue;
                    }
                    valuesX.push(questionNodes[j][i].value);

                }
            }
            options = _.range(numberOfQuestions);
        }

        answers = valuesX.getUnique().sort(function (a, b) {
            return a - b
        });
    }

    function getGradient(color, id) {
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

    function isSignificant(fixedNodes){
        // Observed frequencies
        var observedFrequencies = [];
        fixedNodes.forEach(function(element){
            if (!observedFrequencies[element.pos.x]){
                observedFrequencies[element.pos.x] = [];
            }
            observedFrequencies[element.pos.x][element.pos.y] = element.amount;
        });

        var totalCount = 0;
        var rowTotals = [];
        var columnTotals = [];

        // Compute total count, column totals and row totals
        for (var i = 0; i < observedFrequencies.length; i++){
            for (var j = 0; j < observedFrequencies[i].length; j++){
                if (!columnTotals[i]) columnTotals[i] = 0;
                if (!rowTotals[j]) rowTotals[j] = 0;

                rowTotals[j] += observedFrequencies[i][j];
                columnTotals[i] += observedFrequencies[i][j];
                totalCount += observedFrequencies[i][j];
            }
        }

        var chiSquare = 0;
        var expectedFrequencies = [];
        fixedNodes.forEach(function(element){
            if (!expectedFrequencies[element.pos.x]){
                expectedFrequencies[element.pos.x] = [];
            }

            var x = element.pos.x;
            var y = element.pos.y;

            // Expected frequencies
            expectedFrequencies[x][y] = columnTotals[x] * rowTotals[y] / totalCount;

             // Chi-square
            var observed = observedFrequencies[x][y];
            var expected = expectedFrequencies[x][y]
            chiSquare += (expected - observed) * (expected - observed) / expected;
        });

        var df = (observedFrequencies.length - 1) * (observedFrequencies[0].length - 1);    // degrees of freedom

        // Chi-Square distribution for 0.050 level of confidence
        var distribution = [ -1, // value for 0 degrees of freedom
            3.841,
            5.991,
            7.815,
            9.488,
            11.070,
            12.592,
            14.067,
            15.507,
            16.919,
            18.307,
            19.675,
            21.026,
            22.362,
            23.685,
            24.996,
            26.296,
            27.587,
            28.869,
            30.144,
            31.410,
            32.671,
            33.924,
            35.172,
            36.415,
            37.652,
            38.885,
            40.113,
            41.337,
            42.557,
            43.773,
            55.758,
            67.505,
            79.082,
            90.531,
            101.879,
            113.145,
            124.342
        ];

        //console.log("table: " + (distribution[df] + " got: " + (chiSquare)));
        return chiSquare > distribution[df];
    }

    function showFlag(flag){
        var xDistance = getYLabelSize() + yPanelWidth;

        var flagContainer = svg.append("g")
            .attr("dx", "10")
            .attr("id", "flag")
            .attr("class", "graph-object");

        var color;
        if (flag == true){
            color = "rgb(0, 205, 0)";
            getGradient(color, "Flag");
        }

        else{
            color = "red";
            getGradient(color, "Flag");
        }

        gradientCount++;

        svg.append("text")
            .attr("dx", 0)
            .attr("class", "graph-object flag-text")
            .attr("dy", 0)
            .attr("font-weight", "normal")
            .attr("fill", legendColor)
            .attr("transform", "translate(" + 30 + "," + (h - margin.bottom + 25) + ")")
            .text(function () {
                if (flag == true)
                    return "This result is significant.";
                else
                    return "This result is NOT significant."
            })
            .on("click", function(){$("#btnHelp").click()})
            //.on("mouseover", function(){$("#btnHelp").click()})
            .call(wrap, xDistance - 30);
        //
        var textHeight = $(".flag-text")[0].getBBox().height;
        var flagRadius = 10;

        flagContainer.append("svg:circle")
            .attr("r", flagRadius)
            .attr("class", "graph-object")
            .attr("stroke", d3.rgb(color).darker(2))
            .attr("stroke-width", "1px")
            .attr("fill", 'url(#gradientFlag)')
            .attr("transform", "translate(" + 15 + "," + (h - margin.bottom + textHeight/2 + 10) + ")");

        // Check mark
        svg.append("text")
            .attr("dx", 0)
            .attr("class", "graph-object")
            .attr("dy", 0)
            .attr("text-anchor", "middle")
            .attr("font-weight", "normal")
            .attr("fill", "#FFF")
            .attr("transform", "translate(" + 15 + "," + (h - margin.bottom + textHeight/2 + 15) + ")")
            .text(function () {
                if (flag == true)
                    return "✔";
                else
                    return "✖"
            })
    }

    function updatePercentageView() {
        refreshValues();
        var marginLeft = getYLabelSize() + yPanelWidth;
        // Add fixed nodes
        var fixedNodes = d3.range(answers.length * options.length).map(function (i) {
            return {
                radius: 0,
                fixed: true,
                amount: 0,
                x: (i % answers.length) * ((w - marginLeft) / answers.length) + ((w - marginLeft) / (answers.length * 2)) + marginLeft, // x coordinate computation for the grid
                y: margin.top - 10 + Math.floor(i / answers.length) * ((h - margin.bottom - margin.top) / options.length) + ((h - margin.bottom - margin.top) / (options.length * 2)),  // y coordinate computation for the grid
                pos: {x: (i % answers.length), y: Math.floor(i / answers.length)}
            };
        });

        if (questionNodes < 2) {
            nodes.forEach(function (d) {
                var posAnswer = ($.inArray(d.value, answers));
                var posOption = ($.inArray(d.info[yAxisMode], options));
                if (yAxisMode == "") {
                    posOption = d.tempPosY;
                }

                fixedNodes.forEach(function (o) {
                    if (o.pos.x == posAnswer && o.pos.y == posOption) {
                        o.amount += 1;
                    }
                })
            });
        }
        else {
            for (var i = 0; i < questionNodes.length; i++) {
                for (var j = 0; j < questionNodes[i].length; j++) {
                    var node = questionNodes[i][j];
                    var posAnswer = ($.inArray(node.value, answers));
                    var posOption = ($.inArray(node.info[yAxisMode], options));
                    if (yAxisMode == "") {
                        posOption = node.tempPosY;
                    }

                    fixedNodes.forEach(function (o) {
                        if (o.pos.x == posAnswer && o.pos.y == posOption) {
                            o.amount += 1;
                        }
                    })
                }
            }
        }



        var fixedNodesContainers = svg.selectAll().data(fixedNodes).enter().append("svg:g")
            .attr("class", "fixedNode graph-object")
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
        for (var i = 0; i < answers.length; i++) {
            var label = getLabel(selectedQuestion, answers[i]);
            if (label && label != 0 && label.trim() == "not sure") {
                numberOfAnswers--;
            }
        }

        // Define the gradient
        $("defs").remove();
        $("linearGradient").remove();                               // Remove previous ones
        gradientCount = 0;
        getGradient(defaultBubbleColor, gradientCount++);           // gradient0 - default gradient
        getGradient(notSureColor, gradientCount++);                 // gradient1 - not sure gradient
        for (var i = 0; i < answers.length; i++) {
            getGradient(independetColors(i), gradientCount++);      // From 2 to answers.length, color for each column
        }

        var colorScale = getQuestionColors();

        fixedNodesContainers.append("svg:circle")
            .style("stroke", function (d) {
                var label = getLabel(selectedQuestion, answers[d.pos.x]);
                if (!hasPluggin(selectedQuestion, "unidirectional") && !hasPluggin(selectedQuestion, "bidirectional")) {
                    return d3.rgb(independetColors(d.pos.x)).darker(2);
                }
                if (!label || label.trim() != "not sure")
                    return d3.rgb(colorScale(d.pos.x / (numberOfAnswers - 1))).darker(2);
                else {
                    return d3.rgb(notSureColor).darker(2);
                }
            })
            .attr("r", "1")
            .attr("class", "fixedNodeCircle")
            .attr("fill", function (d) {
                var label = getLabel(selectedQuestion, answers[d.pos.x]);
                if (!hasPluggin(selectedQuestion, "unidirectional") && !hasPluggin(selectedQuestion, "bidirectional")) {
                    return 'url(#gradient' + (d.pos.x + 2) + ')';   // Independent gradients
                }

                if (!label || label.trim() != "not sure") {
                    var color = colorScale(d.pos.x / (numberOfAnswers - 1));
                    getGradient(color, gradientCount);
                    var gradient = 'url(#gradient' + gradientCount + ')';
                    gradientCount++;
                    return gradient;
                }
                else {
                    return 'url(#gradient1)';
                }
            })
            .attr("visibility", function (d) {
                if (d.amount == 0) {
                    return "hidden";
                }
                return "visible";
            })
            .transition().duration(700).attr("r", function (d) {
                var rowTotal = 0;
                fixedNodes.forEach(function (o) {
                    if (o.y == d.y) {
                        rowTotal += o.amount;
                    }
                });
                var x = d3.scale.linear()
                    .domain([0, answers.length])
                    .range([0, w - marginLeft]);
                var y = d3.scale.linear()
                    .domain([0, options.length])
                    .range([0, h - margin.bottom - margin.top - 20]);
                var maxRadius = (Math.min(x(1) - x(0), y(1) - y(0))) / 2 - 10;
                var maxArea = maxRadius * maxRadius * Math.PI;

                var customScale = d3.scale.linear()
                    .domain([0, rowTotal])
                    .range([2, maxArea]);

                var curArea = customScale(d.amount);

                return Math.pow(curArea / Math.PI, 0.5);    // Return the radius
            });

        var deltaX = (w - marginLeft) / (answers.length);
        var deltaY = (h - margin.bottom) / (options.length);

        // ----------- Append percentages --------------

        getGradient("#555", gradientCount);

        // Append box containers
        fixedNodesContainers.append("svg:rect")
            .attr("width", deltaX - 2)
            .attr("height", "20px")
            .attr("transform", function (d) {
                var left, top;
                left = (d.pos.x * deltaX) + marginLeft + 1;
                top = (d.pos.y + 1) * deltaY - 21;
                return "translate(" + left + "," + top + ")";
            })
            .style("fill", "url(#gradient" + gradientCount + ")")
            .attr("class", "table-rect graph-object");

        drawRowTotals(fixedNodes);

        gradientCount++;

        fixedNodesContainers.append("svg:text")
            .attr("x", function (d) {
                //var delta = (w - marginLeft)/(answers.length);
                return (d.pos.x * deltaX) + marginLeft + deltaX / 4;
            })
            .attr("y", function (d) {
                return (d.pos.y + 1) * deltaY - 10;
            })
            .style("text-anchor", "middle")
            .style("font-size", "16px")
            .attr("visibility", function (d) {
                if (d.amount == 0) {
                    return "hidden";
                }
                return "visible";
            })
            .attr("dy", ".31em")
            //.style("text-decoration", "underline")
            .style("fill", "#FFF")
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
                var delta = (w - marginLeft) / (answers.length);
                return (d.pos.x * delta) + marginLeft + delta - deltaX / 4;
            })
            .attr("y", function (d) {
                var delta = (h - margin.bottom) / (options.length);
                return (d.pos.y + 1) * delta - 10;
            })
            .style("text-anchor", "middle")
            .style("font-size", "12px")
            .attr("visibility", function (d) {
                if (d.amount == 0) {
                    return "hidden";
                }
                return "visible";
            })
            .attr("dy", ".31em")
            //.style("text-decoration", "underline")
            .style("fill", "rgb(194, 219, 240)")
            .text(0).transition().duration(700).tween("text", function (d) {
                var i = d3.interpolate(this.textContent, d.amount)
                var rowTotal = 0;   // Percentage is calculated per row

                fixedNodes.forEach(function (o) {
                    if (o.y == d.y) {
                        rowTotal += o.amount;
                    }
                });

                return function (t) {
                    this.textContent = "n = " + (Math.round(i(t)));
                };
            });

        // Calculate and draw significance flag
        if (options.length > 1 && answers.length > 1) {
            $("#significance-flag-container").show();
            if (isSignificant(fixedNodes)) {
                showFlag(true);
            }
            else {
                showFlag(false);
            }
        }
        else {

        }

        svg.selectAll(".fixedNodeCircle").attr("transform", transform);
    }

    function drawOuterRect() {
        //var marginLeft = yAxisMode != "All" ? margin.left : 0;
        svg.append("svg:rect")
            .attr("width", w)
            .attr("height", h - margin.top)
            .attr("transform", "translate(" + 0 + "," + margin.top + ")")
            .style("stroke", tableColor)
            .style("stroke-width", "2px")
            .style("border-radius", "4px")
            .style("fill", "none")
            .attr("class", "table-rect graph-object");
    }

    function hasPluggin(question, pluggin) {
        if (!question){
            return false;
        }
        question = question.trim();
        pluggin = pluggin.trim();
        for (var j = 0; j < metadata.rows.length; j++) {
            var questionID = metadata.rows[j]["Variable"];
            if (questionID == question) {
                var pluggins = getCellContent(questionID, "Features").split(";");
                for (var i = 0; i < pluggins.length; i++) {
                    if (pluggins[i].trim() == pluggin) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    function drawXAxisLegend(marginLeft, x) {
        var value = $(".active label").attr("data-value");
        var delta = (x(1) - x(0));

        for (var j = 0; j < metadata.rows.length; j++) {
            //var reGetQuestionID = /Q[0-9]+[a-z]*/;
            var questionID = metadata.rows[j]["Variable"];
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
                    if (value == "not sure" && view == "mean") {
                        x.domain([0, answers.length - 1]);  // Rescale x axis to make up for ignoring 'not sure' responses in mean view
                        deltaX = (x(1) - x(0));
                    }
                }

                // Draw legend for each answer
                for (var i = 0; i < answers.length; i++) {
                    if (!(labelsArray[answers[i]] == "not sure" && view == "mean")) {   // Ignore no response answers in mean view
                        svg.append("text")
                            .attr("dx", 0)
                            .attr("dy", 0)
                            .attr("class", "x-legend graph-object")
                            .attr("text-anchor", "middle")
                            .attr("font-weight", "normal")
                            .attr("fill", legendColor)
                            .attr("id", "x-legend" + i)
                            .attr("transform", "translate(" + ( x(i) + marginLeft + delta / 2) + "," + 0 + ")")
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
                            .call(wrap, delta);

                        var textHeight = $("#x-legend" + i)[0].getBBox().height;
                        $("#x-legend" + i).attr("y", h - margin.bottom + 10 + (margin.bottom / 2) - textHeight / 2);
                    }
                }
            }
        }

    }

    function drawYAxisLegend(y) {
        for (var i = 0; i < options.length; i++) {
            svg.append("text")
                .attr("class", "y-legend graph-object")
                .attr("id", "y-legend" + i)
                .attr("font-weight", "normal")
                .attr("fill", legendColor)
                .attr("dx", 0)
                .attr("dy", 0)
                .attr("text-anchor", "start")
                .attr("transform", "translate(" + (yPanelWidth + 10) + "," + margin.top + ")")
                .text(function () {
                    if (yAxisMode == 'All')
                        return "";

                    for (var j = 0; j < metadata.rows.length; j++) {
                        var questionID = metadata.rows[j]["Variable"];
                        if (questionID == infoQuestions[yAxisMode]) {
                            if (getLabel(questionID, options[i]) == null) {
                                return options[i];
                            }
                            return getLabel(questionID, options[i]);
                        }
                    }
                    return options[i];
                })
                .call(wrap, 150);

            //Center y axis legend
            var deltaY = y(1) - y(0);
            var height = $("#y-legend" + i)[0].getBBox().height;
            $("#y-legend" + i).attr("y", ((h - margin.bottom) / (options.length)) * i + deltaY / 2 - height / 2);
        }
    }

    function drawHorizontalLines(y) {
        for (var i = 1; i <= options.length; i++) {
            svg.append("svg:line")
                .attr("x1", yPanelWidth)
                .attr("x2", w)
                .attr("y1", y(i))
                .attr("y2", y(i))
                //.attr("id", "line" + i)
                .attr("data-id", i)
                .attr("class", "horizontal-line graph-object")
                .attr("transform", "translate(" + 0 + "," + margin.top + ")")
                .style("stroke", tableColor)
                .style("stroke-width", "1.3px")
        }

        // Line at the top of x axis legend
        svg.append("svg:line")
            .attr("x1", 0)
            .attr("x2", w)
            .attr("y1", h - margin.bottom)
            .attr("y2", h - margin.bottom)
            .attr("class", "horizontal-line graph-object")
            .style("stroke", tableColor)
            .style("stroke-width", "1.3px")
    }

    function drawGrayAlternation(y) {
        // Gray alternation
        for (var i = 0; i <= options.length - 1; i++) {
            if (i % 2 != 0) {
                var grad = svg.append("svg:rect")
                    .attr("width", w)
                    .attr("height", y(1) - y(0))
                    .attr("class", "gray-alternation graph-object")
                    .attr("transform", "translate(" + yPanelWidth + "," + y(i) + ")")
                    .attr("opacity", 0.1)
                    .style("fill", "#000");

                grad.moveToBack();
            }
        }
    }

    function drawVerticalLines(marginLeft, x) {
        for (var i = 1; i < answers.length; i++) {
            svg.append("svg:line")
                .attr("x1", x(i) + marginLeft)
                .attr("x2", x(i) + marginLeft)
                .attr("y1", margin.top)
                .attr("y2", h)
                .attr("class", "vertical-line graph-object")
                .style("stroke", tableColor)
                .attr("stroke-width", "1.3px");
        }
    }

    function drawLegendContainers(marginLeft) {
        svg.append("svg:line")
            .attr("x1", marginLeft)
            .attr("x2", marginLeft)
            .attr("y1", margin.top)
            .attr("y2", h)
            .attr("class", "vertical-line graph-object")
            .style("stroke", tableColor)
            .attr("stroke-width", "1.3px");
    }

    function drawYAxisPanel() {
        if (yAxisMode != "All") {
            svg.append("svg:line")
                .attr("x1", yPanelWidth)
                .attr("x2", yPanelWidth)
                .attr("y1", margin.top)
                .attr("y2", h - margin.bottom)
                .attr("class", "vertical-line graph-object")
                .style("stroke", tableColor)
                .attr("stroke-width", "1.3px");
        }

        svg.append("svg:text")
            .attr("transform", "rotate(-90)")
            .attr("class", "yPanelLabel graph-object")
            .attr("fill", legendColor)
            .style("text-anchor", "middle")
            .style("font-size", "14px")
            .text(yAxisMode);

        // Reposition label
        var textHeight = $(".yPanelLabel")[0].getBBox().height;
        //var textWidth = $(".yPanelLabel")[0].getBBox().width;

        // Case for browsers that do not support the direct use of width()
        /*var browser = ui.getBrowserName;
         if (browser.substring(0,7) == "Firefox" || browser.substr(0,2) == "IE"){
         textHeight = $(".yPanelLabel").text().length * 7;
         textWidth = $(".yPanelLabel").text().length * 7;
         tickWidth = $(".yPanelLabel")[0].textContent.length * 7;
         }*/

        // Reposition y-panelLabel
        $(".yPanelLabel").attr("x", -(h - margin.bottom) / 2);
        $(".yPanelLabel").attr("y", (yPanelWidth / 2) + textHeight / 2);
    }

    function drawGradientBackground(marginLeft) {
        if ($("#dash-pattern").length == 0) {
            var dashWidth = 7;
            $("pattern").remove();
            var g = svg.append("pattern")
                .attr('id', 'dash-pattern')
                .attr('patternUnits', 'userSpaceOnUse')
                .attr('width', dashWidth)
                .attr('height', dashWidth)
                //.attr("x", 0).attr("y", 0)
                .append("g").style("fill", "none").style("stroke", "#CCC").style("stroke-width", 0.5);
            g.append("path").attr("d", "M0,0 l" + dashWidth + "," + dashWidth);
            //g.append("path").attr("d", "M" + dashWidth + ",0 l-" + dashWidth + "," + dashWidth);
        }

        var width = w - marginLeft;
        var height;
        if (view == "heatmap") {
            height = h - margin.top;    // Heat map doesn't use margin bottom
        }
        else {
            height = h - margin.top - margin.bottom
        }

        var grid = svg.append("svg:rect")
            .attr("width", width)
            .attr("height", height)
            .attr("transform", "translate(" + marginLeft + "," + margin.top + ")")
            .style("stroke", tableColor)
            .style("stroke-width", "2px")
            .style("border-radius", "4px")
            .style("fill", "url(#dash-pattern)")
            .attr("class", "table-rect graph-object");

        grid.moveToBack();
    }

    function drawRowTotals(fixedNodes){
        // ---------------- Append total container box and labels  ----------------
        var deltaY = (h - margin.bottom) / (options.length);
        var mWidth;
        if (yAxisMode == "All"){
            mWidth = yPanelWidth - 2;
        }
        else{
            mWidth = getYLabelSize();
        }

        for (var i = 0; i < options.length; i++) {
            svg.append("svg:rect")
                .attr("width", mWidth)
                .attr("height", "20px")
                .attr("transform", function (d) {
                    var left, top;
                    if (yAxisMode == "All"){
                        left = 1;
                        top = h - margin.bottom - 21;
                    }
                    else{
                        left = yPanelWidth;
                        top = (i + 1) * deltaY - 21;
                    }

                    return "translate(" + left + "," + top + ")";
                })
                .style("fill", "url(#gradient" + gradientCount + ")")
                .attr("class", "table-rect graph-object");

            var left;
            if (yAxisMode == "All"){
                left = yPanelWidth / 2;
            }
            else{
                left = yPanelWidth + getYLabelSize() / 2;
            }
            svg.append("svg:text")
                .attr("x", left)
                .attr("y", (i + 1) * deltaY - 6)
                .style("text-anchor", "middle")
                .attr("class", "yPanelLabel graph-object")
                .style("font-size", "12px")
                .style("fill", "rgb(194, 219, 240)")
                .text(function () {
                    var rowTotal = 0;   // Percentage is calculated per row
                    fixedNodes.forEach(function (o) {
                        if (o.pos.y == i) {
                            rowTotal += o.amount;
                        }
                    });
                    return "n = " + rowTotal;
                });
        }
    }

    function drawTable() {
        clearCanvas();

        refreshValues();

        var y = d3.scale.linear()
            .domain([0, options.length])
            .range([0, h - margin.bottom - margin.top]);

        drawYAxisLegend(y);

        var marginLeft = getYLabelSize() + yPanelWidth;

        var x = d3.scale.linear()
            .domain([0, answers.length])
            .range([0, w - marginLeft]);

        // Draw stuff

        drawOuterRect();
        drawXAxisLegend(marginLeft, x);
        drawGrayAlternation(y);
        drawGradientBackground(marginLeft);
        drawHorizontalLines(y, marginLeft);
        drawVerticalLines(marginLeft, x);
        drawLegendContainers(marginLeft);
        drawYAxisPanel();
    }

    function getYLabelSize() {
        var labelWidth = 0;

        for (var i = 0; i < $(".y-legend").length; i++) {
            labelWidth = Math.max(labelWidth, $(".y-legend")[i].getBBox().width)
        }

        return labelWidth == 0 ? 0 : Math.max(labelWidth + 20, 70);
    }

    function transform(d) {
        return "translate(" + d.x + "," + d.y + ")";
    }

    function evenOddTick(val) {
        if (val == "even")
            return "odd";
        else return "even"
    }

    function getCellContent(questionID, columnID){
        for (var j = 0; j < metadata.rows.length; j++) {
            var iterator = metadata.rows[j]['Variable'];
            if (iterator.trim() == questionID.trim()) {
                for (var prop in metadata.rows[j]) {
                    if (prop.trim() == columnID.trim()) {
                        if (metadata.rows[j][prop] != 0) {
                            return metadata.rows[j][prop];
                        }
                        else {
                            return "";
                        }
                    }
                }
            }
        }
        return "";
    }

    function loadQuestions() {
        var title = "";
        var evenOddCounter = "even";

        for (var prop in data.rows[0]) {
            var question = prop;
            var questionContent;

            if(isMultipleSelectOne(question)){
                questionContent = getCellContent(question, "SubVariableLabel");
            }
            else{
                questionContent = getCellContent(question, 'VariableLabel');
            }

            if (getLabel(question, "data-type") == "map") {
                markerQuestions.push(question);
            }

            if (question != null && isMultipleSelectOne(question)) {
                var answer = questionContent.substr(questionContent.lastIndexOf('-') + 1, questionContent.length);
                var id = regExp['multipleQuestionSelectOne'].exec(question)[1];
                if ($("#Q" + id).length == 0) {
                    title = getCellContent(question, 'VariableLabel');

                    $("#listQuestions").append('<li class="' + evenOddCounter + '"><a data-toggle="collapse" class="accordion-toggle" data-parent="#listQuestions" href="' + "#Q" + id + '">' +
                    title +
                    '</a><span class="caret"></span></li>' + '<div id="Q' + id + '"  class="panel-collapse collapse">' + '</div>');
                    evenOddCounter = evenOddTick(evenOddCounter);
                }

                $("#Q" + id).append('<li class="indented"><label class="clickable" data-value="' + question + '">' +
                answer + '</label><span class="btnAdd glyphicon glyphicon-plus"></span></label><span class="btnSubstract glyphicon glyphicon-minus"></span></li>');
            }
            else if (question != null && isSingleChoice(question)) {
                var id = regExp['singleChoice'].exec(question)[1];
                $("#listQuestions").append('<li class="' + evenOddCounter + '"><label  class="clickable" data-value="' + question + '" id="Q' + id + '">' +
                questionContent + '</label></li>');
                evenOddCounter = evenOddTick(evenOddCounter);
            }
        }
    }

    function isMultipleSelectOne(questionID) {
        if (regExp['multipleQuestionSelectOne'].exec(questionID)) {
            return true;
        }
        return false;
    }

    function isSingleChoice(questionID) {
        if (regExp['singleChoice'].exec(questionID)) {
            return true;
        }
        return false;
    }

    function getQuestionTitle(questionID) {
        for (var i = 0; i < metadata.rows.length; i++) {
            if (metadata.rows[i]["NewVar"] == questionID) {
                if (regExp['multipleQuestionSelectOne'].exec(questionID)) {
                    var title = metadata.rows[i]["NewVarLabel"];
                    var titleEnd = title.indexOf('-');
                    if (titleEnd > -1) {
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
        text.each(function () {
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
                    tspan = text.append("tspan").attr("x", 0).attr("y", y).attr("dy", lineHeight + "em").text(word); // ++lineNumber * lineHeight
                }
            }
        });
    }

    return self;
});
