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


define('visualization', ['bootstrap', 'd3Libraries'], function() {
    var self = {};
    var data, metadata, selectedQuestion, svg, radius_scale, nodes, force;
    var radius = 10;
    var yAxisMode = "All";
    var tooltip = CustomTooltip("gates_tooltip", 240);
    var margin = {top:0, bottom:60, left:150, right:0};
    var w = $("#visualizationContent").width() - 1, h = $("#visualizationContent").height() - $("#top-bar").height() - 15;
    var view = "";
    var answers = [];

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
    var infoQuestions = {Gender:"Q12E", Resident: "Q8E", Venue:"VX", FarmTies: "Q11E", SurveySite: "", Education:"Q14E", Age:"Q13E"}

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

    function getValue(questionID, label){
        for (var i = 0; i < metadata.rows.length; i++){
            if (metadata.rows[i]["ID"] == questionID){
                for (var prop in metadata.rows[i]){
                    if (metadata.rows[i][prop] == label){
                        return prop;
                    }
                }
            }
        }
    }

    function getLabel(questionID, value){
        for (var i = 0; i < metadata.rows.length; i++){
            if (metadata.rows[i]["ID"] == questionID){
                return metadata.rows[i][value];
            }
        }
    }

    function initializeGraph(){
        radius_scale = d3.scale.pow().exponent(0.5).domain([0, data.rows.length - 1]).range([2, 85]);
        nodes = d3.range(data.rows.length - 1).map(function(d, i) {
            var Resident =      getLabel(infoQuestions.Resident, data.rows[i + 1][infoQuestions.Resident]);
            var Gender =        getLabel(infoQuestions.Gender, data.rows[i + 1][infoQuestions.Gender]);
            var Education =     getLabel(infoQuestions.Education, data.rows[i + 1][infoQuestions.Education]);
            var Age =           getLabel(infoQuestions.Age, data.rows[i + 1][infoQuestions.Age]);
            var FarmTies =      getLabel(infoQuestions.FarmTies, data.rows[i + 1][infoQuestions.FarmTies]);
            var Venue = data.rows[i + 1][infoQuestions.Venue];

            var info = {Resident: Resident, Venue:Venue, FarmTies:FarmTies, Gender: Gender, Education: Education, Age: Age};

            return {radius: radius, value: 0, info: info, cx: w/2, cy: (h - margin.bottom) / 2};
        });

        force = d3.layout.force()
            .gravity(0)
            .charge(0)
            .nodes(nodes)
            .size([w, h])
            .on("tick", tick);

        force.start();

        svg = d3.select("#visualizationContent").append("svg:svg")
            .attr("width", w)
            .attr("height", h);

        drawTable();
        setNodeView();

        $("#collapsedview").click(setCollapsedView);
        $("#nodeview").click(setNodeView);

        $('#listQuestions .clickable').click(onListQuestionClick);
        $('#listQuestions li').click(onListQuestionClick);
        $('#lstYAxisMode li').click(onYAxisModeChange);
    }

    function tick(e) {
        nodes.forEach(function(d) {
            d.y += (d.cy - d.y) * e.alpha;
            d.x += (d.cx - d.x) * e.alpha;
        });

        svg.selectAll("circle").attr("transform", transform);
    }

    function onListQuestionClick(e){
        var that = $(e.target).closest(".clickable").length > 0 ? $(e.target).closest(".clickable") :$(e.target).find(".clickable");

        if (that.length == 0){
            return;
        }

        if (view == "node"){
            force.resume();
        }

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

        positionNodes(selectedQuestion);
        drawTable();

        if (view != "node"){
            /*svg.selectAll("circle").transition().duration(200).attr("r", function(d) {
                return radius_scale(0);
            }).remove();*/

            //svg.selectAll("line").attr("visibility", "hidden");
            svg.selectAll("circle").remove();
            svg.selectAll(".node").transition().duration(550).remove();
            svg.selectAll(".fixedNode").transition().duration(550).remove();
            svg.selectAll(".fixedNode text").remove();
            addFixedNodes();
        }
    }

    function positionNodes(selectedQuestion){
        var valuesX = [];
        var valuesY = []
        var marginLeft = yAxisMode != "All" ? margin.left : 0;

        // populate value arrays
        for (var i = 0; i < nodes.length; i++){
            nodes[i].value = data.rows[i + 1][selectedQuestion];
            valuesX.push(data.rows[i + 1][selectedQuestion]);
            valuesY.push(data.rows[i + 1][infoQuestions[yAxisMode]]);
        }
        var customRadius = radius;

        var separation = radius * 2;
        // X axis
        answers = valuesX.getUnique().sort(function(a, b){return a-b});
        var options = valuesY.getUnique().sort(function(a, b){return a-b});

        var xDelta = (w - marginLeft) / (answers.length);
        var yDelta = (h - margin.bottom) / (options.length);
        var maxPerRow = Math.floor(xDelta / separation) - 1;
        var maxPerColumn = Math.floor(yDelta / separation) - 1;
        var counters = [];

        for (var i = 0; i < answers.length; i++){
            counters.push([]);
        }

        for (var i = 0; i < options.length; i++){
            options[i] = getLabel(infoQuestions[yAxisMode], options[i]);
        }

        nodes.forEach(function(d) {
            var posX = $.inArray(d.value, answers);
            var posY = options.length - 1 - $.inArray(d.info[yAxisMode], options);

            if (counters[posX][posY] == null){
                counters[posX][posY] = 0;
            }

            d.cx = marginLeft + (posX * xDelta) + (counters[posX][posY] % maxPerRow ) * separation + separation / 2 + ((xDelta - maxPerRow * separation) / 2);
            d.cy = (posY * yDelta) + Math.floor(counters[posX][posY] / maxPerRow) * separation + separation / 2 + ((yDelta - maxPerColumn * separation) / 2);

            if (d.cy + separation > (posY + 1) * yDelta){
                var fitFactor = 0;

                while (d.cy + separation > (posY + 1) * yDelta){
                    fitFactor++;
                    d.cy -= yDelta - separation * 1.5;
                }

                switch((fitFactor - 1) % 2){
                    case 0: d.cx += radius / 2 * fitFactor; break;   // move to right
                    case 1: d.cx -= radius / 2 * fitFactor; break;   // move to left
                }
            }

            d.radius = customRadius;
            counters[posX][posY]++;
        });
    }

    function onYAxisModeChange(e){
        yAxisMode = e.target.getAttribute("data-axis");
        $("#btnCategories").text(yAxisMode)

        drawTable();

        if (view == "node"){
            shuffleNodes();
            svg.selectAll("circle").transition().duration(1000)
                .style("fill", function(d, i) {
                    var val = getValue(infoQuestions[yAxisMode], d.info[yAxisMode]);
                    var myColor = d3.scale.category10().range();
                    return myColor[parseInt(val)];
                });

            positionNodes(selectedQuestion);
        }
        else{
            svg.selectAll("circle").remove();
            svg.selectAll(".node").transition().duration(550).remove();
            svg.selectAll(".fixedNode").transition().duration(550).remove();
            svg.selectAll(".fixedNode text").remove();
            addFixedNodes();
        }
    }

    function shuffleNodes(){
        nodes.forEach(function(o, i) {
            o.x += (Math.random() - .5) * 10;
            o.y += (Math.random() - .5) * 10;
        });
        force.resume();
    }

    function setCollapsedView(){
        if (view == "collapsed")
            return;

        view = "collapsed";
        //svg.selectAll("line").attr("visibility", "hidden");
        //svg.selectAll(".y-legend").remove();

        svg.selectAll("circle").transition().duration(500).attr("r", 1e-6).remove();
        svg.selectAll(".node").transition().duration(520).remove();

        force.stop();

        addFixedNodes();
    }

    function setNodeView(){
        if (view == "node")
            return;
        view = "node";
        force.resume();
        svg.selectAll(".fixedNode text").remove();
        svg.selectAll("circle").transition().duration(500).attr("r", function(d) {
                return radius_scale(0);
        }).remove();

        svg.selectAll("line").attr("visibility", "default");
        var g = svg.selectAll().data(nodes)
        .enter().append("svg:g")
            .attr("class", "node")
            .attr("stroke", "#222")
            .style("fill", "#aaa")
            .attr("stroke-width", "2")
            .on("mouseover", function(d,i){
                d3.select(this).attr("stroke", "black")
                d3.select(this).attr("stroke-width", "3")
                var content ="<span class=\"name\">Originally from Utah: </span><span class=\"value\">" + d.info.Resident + "</span><br/>";
                content +="<span class=\"name\">Gender: </span><span class=\"value\">" + d.info.Gender + "</span><br/>";
                content +="<span class=\"name\">Age: </span><span class=\"value\">" + d.info.Age + "</span><br/>";
                content +="<span class=\"name\">Education: </span><span class=\"value\">" + d.info.Education + "</span><br/>";
                content +="<span class=\"name\">Farm Ties: </span><span class=\"value\">" + d.info.FarmTies + "</span><br/>";
                content +="<span class=\"name\">Survey Venue: </span><span class=\"value\">" + d.info.Venue + "</span><br/>";
                content +="<span class=\"name\">Value: </span><span class=\"value\">" + d.value + "</span>";
                tooltip.showTooltip(content,d3.event);
            })
            .on("mouseout", function(d, i){
                d3.select(this).attr("stroke","#222");
                d3.select(this).attr("stroke-width", "2");
                tooltip.hideTooltip();
            })
            .call(force.drag);

        var circle = g.append("svg:circle")
            .attr("r", function(d) { return 0; })
            .attr("data-value", function(d){return d.value})
            .style("fill", function(d, i) {
                var myColor = d3.scale.category10().range();
                var val = getValue(infoQuestions[yAxisMode], d.info[yAxisMode]);
                return myColor[parseInt(val)];
            });

       circle.transition().duration(500).attr("r", function(d) {
            return d.radius - 2;
       });

       positionNodes(selectedQuestion);
       shuffleNodes();

        /*g.append("svg:text")
          .attr("x", -5)
          .attr("dy", ".31em")
          .style("stroke-width", 0)
          .style("fill", "#fff")
          .text(function(d) {
                if (d.info.Gender == "1"){return "♂";}
                else if(d.info.Gender == "2"){return "♀"}
                else return "";
            });*/
    }

    function addFixedNodes(){
        // Add fixed nodes
        var values = [];
        for (var i = 0; i < nodes.length; i++){
            values.push(data.rows[i + 1][infoQuestions[yAxisMode]]);
        }
        var options = values.getUnique().sort(function(a, b){return b-a});
        var marginLeft = yAxisMode != "All" ? margin.left : 0;

        var fixedNodes = d3.range(answers.length * options.length).map(function(i) {
          return {
                  radius: 0,
                  fixed:true,
                  amount:0,
                  x: (i % answers.length) * ((w - marginLeft) / answers.length) + ((w - marginLeft)/(answers.length * 2)) + marginLeft,
                  y: Math.floor(i / answers.length) * ((h - margin.bottom) / options.length) + ((h - margin.bottom)/(options.length * 2)),
                  pos: {x:(i % answers.length), y:Math.floor(i / answers.length)}};
        });

        for (var i = 0; i < options.length; i++){
            options[i] = getLabel(infoQuestions[yAxisMode], options[i]);
        }

        nodes.forEach(function(d, i) {
           var posAnswer = ($.inArray(d.value, answers));
           var posOption = ($.inArray(d.info[yAxisMode], options))

           fixedNodes.forEach(function(o){
               if (o.pos.x == posAnswer && o.pos.y == posOption){
                   o.amount += 1;
               }
           })
        });

        var fixedNodesContainers = svg.selectAll().data(fixedNodes).enter().append("svg:g")
            .attr("class", "fixedNode")
            .attr("fill", "#FFF")
            .attr("stroke-width", "3")

        fixedNodesContainers.append("svg:circle")
            .style("stroke", function(d, i){
                var myColor = d3.scale.category10().range();
                var index = options.length - 1 - Math.floor(i / answers.length);
                return myColor[index];
            })
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
                    .range([0, h - margin.bottom]);
                var maxRadius = (Math.min(x(1) - x(0), y(1) - y(0))) / 2 - 10;

                var customScale = d3.scale.pow().exponent(0.5).domain([0, rowTotal]).range([2, maxRadius]);
                return customScale(d.amount);
            })
            .attr("opacity", 0.4);

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
          .attr("class", "percentageLabel")
          .style("stroke-width", 0)
          .style("text-decoration", "underline")
          .style("fill", "#000")
          .attr("class", "shadow")
          .text(0).transition().duration(700).tween("text", function(d) {
                var rowTotal = 0;
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
                        this.setAttribute("y" , y + 40);
                    }

                    // Once the circle is large enough, move the label to the center
                    if (value > 12 && parseFloat(this.getAttribute("y")) != y){
                        this.setAttribute("y" , y);
                    }
                };
          });

        svg.selectAll("circle").attr("transform", transform);
    }

    function drawOuterRect(){
       //var marginLeft = yAxisMode != "All" ? margin.left : 0;
       svg.append("svg:rect")
        .attr("width", w)
        .attr("height", h)
        .attr("transform", "translate(" + 0 + "," + 0 + ")")
        .style("stroke", "#000")
        .style("stroke-width", "1")
        .style("fill", "none");
    }

    function drawVerticalLines(marginLeft, x){
        for (var i = 0; i < answers.length; i++){
            svg.append("svg:line")
                .attr("x1", x(i) + marginLeft)
                .attr("x2", x(i) + marginLeft)
                .attr("y1", 0)
                .attr("y2", h)
                //.attr("id", "line" + i)
                .attr("data-id", i)
                .attr("class", "vertical-line")
                .style("stroke", "#777")
                .style("stroke-width", "1px");
        }

        var colorScale = [];
        colorScale["-1"] = "#44FF44";   // Red
        colorScale["0"] = "#FFFFFF";    // Neutral
        colorScale["1"] = "#FF4444";    // Green
        var gradientOpacity = 0.4;

        for (var i = 0; i < answers.length; i++){
             var line = svg.append("svg:rect")
                .attr("width", x(i) - x(i-1))
                .attr("class", "colorShade")
                .attr("height", h - margin.bottom)
                .attr("transform", "translate(" + (marginLeft + x(i)) + "," + margin.top + ")")
                .attr("opacity", function(d){
                     if (i == (answers.length - 1) / 2)
                        return gradientOpacity / (i + 1);
                     else if (i < (answers.length - 1) / 2)
                        return gradientOpacity / (i + 1);
                     else{
                        return gradientOpacity / (answers.length - i);
                     }
                 })
                .style("fill", function(d){
                     if (i == (answers.length - 1) / 2)
                        return colorScale["0"];
                     else if (i < (answers.length - 1) / 2)
                        return colorScale["1"];
                     else{
                         return colorScale["-1"];
                     }
                 });
            line.moveToBack();
        }
    }

    function drawXAxisLegend(marginLeft, x){
        var value = $(".active label").attr("data-value");

        for (var i = 0; i < answers.length; i++){
           svg.append("text")
              .attr("x", x(i) + marginLeft + (x(1) - x(0))/2)
              .attr("class", "x-legend")
              .attr("text-anchor", "middle ")
              .attr("y", h - margin.bottom + 20)
              .attr("dy", ".31em")
              .attr("id", "x-legend" + i)
              .attr("font-weight", "bold")
              .attr("data-id", i)
              .style("stroke-width", 0)
              .style("fill", "#000")
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
              });
        }
    }

    function drawYAxisLegend(marginLeft, options){
        for (var i = 0; i < options.length; i++){
            svg.append("text")
              .attr("class", "y-legend")
              .attr("data-id", i)
              .attr("id", "y-legend" + i)
              .attr("dx", marginLeft - 10)
              .attr("text-anchor", "end")
              .style("stroke-width", 0)
              .attr("font-weight", "bold")
              .style("fill", "#000")
              .attr("y", ((h - margin.bottom) / (options.length)) * i + 30)
              .text(function(){
                   if (yAxisMode == 'All')
                       return "";
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
              .call(wrap, marginLeft - 10, marginLeft - 10);
        }
    }

    function drawHorizontalLines(marginLeft, options, y){
        for (var i = 0; i <= options.length; i++){
            svg.append("svg:line")
                .attr("x1", 0)
                .attr("x2", w)
                .attr("y1", y(i))
                .attr("y2", y(i))
                //.attr("id", "line" + i)
                .attr("data-id", i)
                .attr("class", "horizontal-line")
                .style("stroke", "#777")
                .style("stroke-width", "1px")
        }
    }

    function drawLegendContainers(){
        var marginLeft = yAxisMode != "All" ? margin.left : 0;

        svg.append("svg:rect")
            .attr("width", marginLeft)
            .attr("height", h)
            .attr("transform", "translate(" + 0 + "," + 0 + ")")

            .attr("opacity", "0.5")
            .style("fill", "#aaa");

        svg.append("svg:rect")
            .attr("width", w)
            .attr("height", margin.bottom)
            .attr("transform", "translate(" + 0 + "," + (h - margin.bottom) + ")")
            .style("stroke", "#000")
            .style("stroke-width", "1")
            .attr("opacity", "0.5")
            .style("fill", "#aaa");
    }

    function drawTable(){
        if (svg != null){
            svg.selectAll(".x-legend").remove();
            svg.selectAll(".y-legend").remove();
            svg.selectAll("rect").remove();
            svg.selectAll("line").remove();
            svg.selectAll("rect").remove();
        }

        var marginLeft = yAxisMode != "All" ? margin.left : 0;

        var x = d3.scale.linear()
            .domain([0, answers.length])
            .range([0, w - marginLeft]);

        var values = [];
        for (var i = 0; i < nodes.length; i++){
            values.push(data.rows[i + 1][infoQuestions[yAxisMode]]);
        }
        var options = values.getUnique().sort(function(a, b){return b-a});

        var y = d3.scale.linear()
            .domain([0, options.length])
            .range([0, h - margin.bottom]);

        // Draw stuff
        drawOuterRect();
        drawLegendContainers();
        drawYAxisLegend(marginLeft, options);
        drawVerticalLines(marginLeft, x);
        drawXAxisLegend(marginLeft, x);
        drawHorizontalLines(marginLeft, options, y);
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

            /*for (var j = 0; j < metadata.rows.length; j++){
                if (metadata.rows[j]['Question'].startsWith(data.rows[0][data.headers[i]])){
                    question = metadata.rows[j]['Question'];
                    break;
                }
            }*/

            if (question != null && regExp['reMS'].exec(question)){
                var answer = questionContent.substr(questionContent.lastIndexOf('-') + 1, questionContent.length);

                if (title != questionContent.substr(0, questionContent.lastIndexOf('-'))){
                    title = questionContent.substr(0, questionContent.lastIndexOf('-'));
                    var id = regExp['reMS'].exec(question)[1];
                    $("#listQuestions").append('<li class="'+ evenOddCounter +'"><a data-toggle="collapse" class="accordion-toggle" data-parent="#listQuestions" href="' + "#Q" + id + '">' + title + '</a><span class="caret"></span></li>' +
                                                    '<div id="Q' + id + '"  class="panel-collapse collapse">' + '</div>'
                                                );
                    evenOddCounter = evenOddTick(evenOddCounter);
                }

                var questionType = regExp['reMS'].exec(question)[3];

                /*if (questionType == "m"){
                    $("#Q" + id ).append('<li class="clickable indented" data-value="' + question + '"><label class="checkbox">' +
                                                                    '<input type="checkbox">' + answer + '</label></li>');
                }*/
                //else if(questionType == "s"){
                    $("#Q" + id ).append('<li class="indented"><label class="clickable" data-value="' + question+ '">' +
                                                                answer + '</label></li>');
                //}
            }
            /*else if (question != null && regExp['reSG'].exec(question)){
                var id = regExp['reSG'].exec(question)[1];
                if ($("#Q" + id).length == 0){
                    $("#listQuestions").append('<li class="'+ evenOddCounter +'"><a data-toggle="collapse" class="accordion-toggle collapsed" data-parent="#listQuestions" href="' +
                                                            "#Q" + id + '">' + "General" + '</a>' + '<span class="caret"></span></li>' +
                                                '<div class="panel-collapse collapse" id="Q' + id + '">' + '</div>');
                    evenOddCounter = evenOddTick(evenOddCounter);
                }

                $("#Q" + id).append('<li class="indented"><label class="clickable" data-value="' + question + '">' + questionContent + '</label></li>');
            }*/
            else if (question != null && regExp['reS'].exec(question)){
                var id = regExp['reS'].exec(question)[1];
                $("#listQuestions").append('<li class="'+ evenOddCounter +'"><label  class="clickable" data-value="'+ question + '" id="Q' + id + '">' +
                                               questionContent + '</label></li>');
                evenOddCounter = evenOddTick(evenOddCounter);
            }
        }
    }

    function wrap(text, width, margin) {
        text.each(function() {
            var text = d3.select(this),
            words = text.text().split(/\s+/).reverse(),
            word,
            line = [],
            lineNumber = 0,
            lineHeight = 1.1, // ems
            y = text.attr("y");
            dy = parseFloat(text.attr("dy"));
            if (!(dy > 0)) dy = 0;

            var tspan = text.text(null).append("tspan").attr("x", 0).attr("y", y).attr("dy", dy + "em");
            while (word = words.pop()) {
              line.push(word);
              tspan.text(line.join(" "));
              if (tspan.node().getComputedTextLength() > width) {
                line.pop();
                tspan.text(line.join(" "));
                line = [word];
                tspan = text.append("tspan").attr("x", margin).attr("y", y).attr("dy", ++lineNumber * lineHeight + dy + "em").text(word);
              }
            }
        });
    }
	return self;
});

