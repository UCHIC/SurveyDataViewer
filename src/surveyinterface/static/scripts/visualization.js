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

define('visualization', ['generalLibraries', 'd3Libraries'], function() {
    var self = {};
    var data, metadata;
    var radius = 15;
    var charge = -45;
    var gravity = 0.05;

    var tooltip = CustomTooltip("gates_tooltip", 240);

    var colorFemale = d3.rgb(186,85,211);
    var colorMale = d3.rgb(100,149,237);
    var colorDefault = d3.rgb(190,190,190);

    var w = 1100, h = 600;
    var x = d3.scale.ordinal()
        .domain(d3.range(1))
        .rangePoints([0, w], 1);

    var svg;
    var view = "";
    var answers = [0];

    var radius_scale, nodes, force;

    // Multiple choices (s:select one, m:select multiple) - Single choice group - Single choice
    var regExp = {reMS: /^Q([0-9]+)_([0-9]) ([a-z])/, reSG: /^Q([0-9])+[a-z]/,  reS:/^Q([0-9]+)/};

    self.loadData = function() {
        $.ajax(self.dataFile, {
            success: function(csvData) { //men esto ta deprecated.
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

    self.dataFile = '';
    self.metadataFile = '';

    function initializeGraph(){
        radius_scale = d3.scale.pow().exponent(0.5).domain([0, data.rows.length - 1]).range([2, 85]);
        nodes = d3.range(data.rows.length - 1).map(function(d, i) {
            var resident = data.rows[i+ 1]["Do you live in Cache County, Utah? "] == 1 ? "Yes" : "No";
            var gender = data.rows[i+ 1]["Are you female or male?"];
                    if (gender == "1"){
                        gender = "Male"
                    }
                    else if(gender == "2"){
                        gender = "Female";
                    }
                    else{
                        gender = "";
                    }
              return {radius: radius, value: 0, gender: data.rows[i+ 1]["Are you female or male?"], resident: resident, cx: w/2, genderString: gender,
            cy: h / 2};
        })

        force = d3.layout.force()
            .gravity(gravity)
            .charge(charge)
            .nodes(nodes)
            .size([w, h]);

        force.start();

        svg = d3.select("#visualizationContent").append("svg:svg")
            .attr("width", w)
            .attr("height", h);

        svg.append("svg:rect")
            .attr("width", w)
            .attr("height", h)
            .style("stroke", "#000")
            .style("stroke-width", "2")
            .style("fill", "#fff");

        setNodeView();

        force.on("tick", tick);

        $("#collapsedview").click(setCollapsedView);
        $("#nodeview").click(setNodeView);

        $('#listQuestions .clickable').click(onListQuestionClick);
    }

    function tick(e) {
        nodes.forEach(function(d, i) {
            //var pos = ($.inArray(d.value, answers));
            if (!d.fixed){
                d.x += (d.cx - d.x) * e.alpha * 0.2;
                d.y += (1 * d.cy - d.y) * e.alpha * 0.2;
            }
        });

        svg.selectAll("circle").attr("transform", transform);
        svg.selectAll(".node text").attr("transform", transform);

        // Reposition vertical lines
        for (var i = 0; i < answers.length - 1; i++){
            var max = -Infinity;
            var min = Infinity;

            nodes.forEach(function(d){
                var pos = ($.inArray(d.value, answers));

                if (pos == i && max < d.x + d.radius){
                    max = d.x + d.radius;
                }
                else if (pos == i + 1 && min > d.x){
                    min = d.x - d.radius;
                }
            })

            if (svg.select("#line" + i)[0][0] != null){
                svg.select("#line" + i).attr("x1", (max + min)/2);
                svg.select("#line" + i).attr("x2", (max + min)/2);
            }
            if (svg.select("#text" + (i))[0][0] != null){
                svg.select("#text" + (i)).attr("x", (max - 100));
            }
        }
    }

    function onListQuestionClick(e) {
        var that = $(e.target).closest(".clickable");
        // force.charge(charge);
        if (view == "node"){
            force.resume();
        }

        $('#listQuestions .clickable').removeClass("active");
        $('#listQuestions  .clickable > .panel-heading').removeClass("active");

        that.addClass("active");

        var value = that.attr("data-value");
        var title = value.substr(0, value.lastIndexOf('--'));
        var content;
        if (value.lastIndexOf('--') != -1){
            content = value.substr(value.lastIndexOf('--') + 2, value.length);
        }
        else{
            content = value.substr(0, value.length);
        }

        $("#txtDescription").text("");
        $("#txtTitle").text(title);
        if ($("#txtTitle").text() == ""){
            $("#txtTitle").hide();
        }
        else{
            $("#txtTitle").show();
        }

        $("#txtDescription").text(content);

        if ($("#txtDescription").text() == ""){
            $("#txtDescription").hide();
        }
        else{
            $("#txtDescription").show();
        }

        for (var i = 0; i < nodes.length; i++){
           nodes[i].value = data.rows[i + 1][value];
        }

        // get the number of different answers
        var values = [];
        for (var i = 0; i < nodes.length; i++){
                values.push(data.rows[i + 1][value]);
        }

        answers = values.getUnique().sort(function(a, b){return b-a});

        x = d3.scale.ordinal()
        .domain(d3.range(answers.length))
        .rangePoints([0, w], 1);

        nodes.forEach(function(d) {
            d.cx = x($.inArray(d.value, answers));
        });

        svg.selectAll("line").remove();
        if (view == "node"){
            drawTable(value);
        }
        else{
            svg.selectAll("circle").transition().duration(500).attr("r", function(d) {
                return radius_scale(0);
            }).remove();
            svg.selectAll(".node").transition().duration(550).remove();
            svg.selectAll(".fixedNode").transition().duration(550).remove();
            addFixedNodes();
        }
    }

    function setCollapsedView() {
        if (view == "collapsed")
            return;

        view = "collapsed";
        svg.selectAll("line").remove();

        svg.selectAll("circle").transition().duration(500).attr("r", 1e-6).remove();
        svg.selectAll(".node").transition().duration(520).remove();

        force.stop();

        addFixedNodes();
    }

    function setNodeView() {
        if (view == "node")
            return;
        view = "node";
        force.resume();
        svg.selectAll("circle").transition().duration(500).attr("r", function(d) {
                return radius_scale(0);
        }).remove();

        var g = svg.selectAll().data(nodes)
        .enter().append("svg:g")
            .attr("class", "node")
            .attr("stroke", function(d, i) {
                if (d.gender == "1"){
                    return d3.rgb(colorMale).darker(2);
                }
                else if(d.gender == "2"){
                    return d3.rgb(colorFemale).darker(2);
                }
                else{
                    return d3.rgb(colorDefault).darker(2);
                }
            })
            .attr("stroke-width", "2")
            .on("mouseover", function(d,i){

                d3.select(this).attr("stroke", "black")
                d3.select(this).attr("stroke-width", "3")
                var content ="<span class=\"name\">Utah resident: </span><span class=\"value\">" + d.resident + "</span><br/>"
                content +="<span class=\"name\">Gender: </span><span class=\"value\">" + d.genderString + "</span><br/>"
                content +="<span class=\"name\">Value: </span><span class=\"value\">" + d.value + "</span>"
                tooltip.showTooltip(content,d3.event)
            })
            .on("mouseout", function(d, i){
                d3.select(this).attr("stroke", function() {
                    if (d.gender == "1"){
                        return d3.rgb(colorMale).darker(2);
                    }
                    else if(d.gender == "2"){
                        return d3.rgb(colorFemale).darker(2);
                    }
                    else{
                        return d3.rgb(colorDefault).darker(2);
                    }
                })
                d3.select(this).attr("stroke-width", "2")
                tooltip.hideTooltip()
            })
            //.call(force.drag);

        var circle = g.append("svg:circle")
            .attr("r", function(d) { return 0; })
            .attr("data-value", function(d){return d.value})
            .style("fill", function(d, i) {
                if (d.gender == "1"){
                    return colorMale;
                }
                else if(d.gender == "2"){
                    return colorFemale;
                }
                else{
                    return colorDefault;
                }
            });

       circle.transition().duration(500).attr("r", function(d) {
                return d.radius - 2;;
        });

        g.append("svg:text")
          .attr("x", -5)
          .attr("dy", ".31em")
          .style("stroke-width", 0)
          .style("fill", "#fff")
          .text(function(d) {
                if (d.gender == "1"){return "♂";}
                else if(d.gender == "2"){return "♀"}
                else return "";
            });
    }

    function addFixedNodes() {
        // Add fixed nodes
        var fixedNodes = d3.range(answers.length).map(function(i) {
          return {type: Math.random() * 5 | 0,
                  radius: 30,
                  fixed:true,
                  amount:0,
                  x: i * w / answers.length + w/(answers.length * 2),
                  y: h / 2};
        })

        nodes.forEach(function(d, i) {
            var pos = ($.inArray(d.value, answers));
            fixedNodes.forEach(function(o, i){
                if (i == pos){
                    o.amount += 1;
                }
            })
        });

        var fixedNodesContainers = svg.selectAll().data(fixedNodes).enter().append("svg:g")
            .attr("class", "fixedNode")
            .attr("stroke", "#000")
            .attr("stroke-width", "2")

        fixedNodesContainers.append("svg:circle")
            .style("fill", "#aaa")
            .attr("r", "0")
            .transition().duration(700).attr("r", function(d) {
                return radius_scale(d.amount);
            });

        svg.selectAll("circle").attr("transform", transform);
    }

    function drawTable(value) {
        // Draw table
        svg.append("svg:line")
                .attr("x1", 0)
                .attr("x2", w)
                .attr("y1", h - 50)
                .attr("y2", h - 50)
                .style("stroke", "#000")
                .style("stroke-width", "1px")



        svg.selectAll(".legend").remove();
        for (var i = 0; i < answers.length; i++){
           svg.append("text")
              .attr("x", x(i))
              .attr("class", "legend")
              .attr("y", h - 25)
              .attr("dy", ".31em")
              .attr("id", "text" + i)
              .style("stroke-width", 0)
              .style("fill", "#000")
              .text(function(){
                   for (var j = 0; j < metadata.rows.length; j++){
                        var reGetQuestionID = /^[a-z|A-Z|0-9|_]*/;
                        var questionID = reGetQuestionID.exec(metadata.rows[j]["Question"]);
                       if (questionID == data.rows[0][value]){
                           if (metadata.rows[j][answers[i]] == null){
                               return "No response";
                           }
                           return metadata.rows[j][answers[i]] == "0" ? " " : metadata.rows[j][answers[i]];
                       }
                   }
                   return data.rows[0][value] + ": " + answers[i];
               });
        }

        // Vertical lines
        for (var i = 0; i < answers.length - 1; i++){
            svg.append("svg:line")
                .attr("x1", (x(i) + x(i+1)) / 2)
                .attr("x2", (x(i) + x(i+1)) / 2)
                .attr("y1", 0)
                .attr("y2", h - 50)
                .attr("id", "line" + i)
                .style("stroke", "#000")
                .style("stroke-width", "1px")
        }
    }

    function transform(d) {
        return "translate(" + d.x + "," +d.y + ")";
    }

    function loadQuestions() {
        var title = "";

        for (var i = 1; i < data.headers.length; i++){
            var question;
            var questionContent = data.headers[i];

            for (var j = 0; j < metadata.rows.length; j++){
                if (metadata.rows[j]['Question'].startsWith(data.rows[0][data.headers[i]])){
                    question = metadata.rows[j]['Question'];
                    break;
                }
            }

            if (question != null && regExp['reMS'].exec(question)){
                var answer = questionContent.substr(questionContent.lastIndexOf('--') + 2, questionContent.length);

                if (title != questionContent.substr(0, questionContent.lastIndexOf('--'))){
                    title = questionContent.substr(0, questionContent.lastIndexOf('--'));


                    var id = regExp['reMS'].exec(question)[1];
                    $("#listQuestions").append('<div class="panel panel-default">' +
                                                    '<div class="panel-heading"><a data-toggle="collapse" class="accordion-toggle" data-parent="#listQuestions" href="' + "#Q" + id + '">' + title + '</a></div>' +
                                                    '<div id="Q' + id + '"  class="panel-collapse collapse">' +
                                                        '<div class="panel-body">' +
                                                            '<div class="list-group"> ' +
                                                                '<ul class="list-group input-group default-values">' +
                                                                '</ul>' +
                                                            '</div>' +
                                                        '</div>' +
                                                    '</div>' +
                                                '<div>');
                }
                var questionType = regExp['reMS'].exec(question)[3];
                if (questionType == "m"){
                    $("#Q" + id + " .input-group").append('<li class="list-group-item clickable" data-value="' + data.headers[i]+ '">' +
                                                                '<label class="checkbox">' +
                                                                    '<input type="checkbox">' + answer +
                                                                '</label>'+
                                                            '</li>');
                }
                else if(questionType == "s"){
                    $("#Q" + id + " .input-group").append('<li class="list-group-item clickable" data-value="' + data.headers[i]+ '">' +
                                                                '<label>' +
                                                                    answer +
                                                                '</label>'+
                                                            '</li>');
                }
            }
            else if (question != null && regExp['reSG'].exec(question)){
                var id = regExp['reSG'].exec(question)[1];
                if ($("#Q" + id).length == 0){
                    $("#listQuestions").append('<div>' +
                                                '<div class="panel-heading"><a data-toggle="collapse" class="accordion-toggle collapsed" data-parent="#listQuestions" href="' + "#Q" + id + '">' + "General" + '</a></div>' +
                                                '<div class="panel-collapse collapse" id="Q' + id + '" class="panel panel-default">' +
                                                    '<div class="panel-body">' +
                                                        '<div class="list-group"> ' +
                                                            '<ul class="list-group input-group default-values">' +
                                                            '</ul>' +
                                                        '</div>' +
                                                    '</div>' +
                                                '</div>' +
                                            '<div>');
                }

                $("#Q" + id + " .input-group").append('<li class="list-group-item clickable" data-value="' + data.headers[i]+ '">' +
                                                                '<label>' +
                                                                    questionContent +
                                                                '</label>'+
                                                            '</li>');
            }
            else if (question != null && regExp['reS'].exec(question)){
                var id = regExp['reS'].exec(question)[1];
                $("#listQuestions").append('<div  class="clickable panel panel-default" data-value="'+ data.headers[i] + '" id="Q' + id + '" class="panel panel-default">' +
                                                '<div class="panel-heading"><h4 class="panel-title">' + questionContent + '</h4></div>' +

                                            '<div>');
            }
        }
    }

	return self;
});
