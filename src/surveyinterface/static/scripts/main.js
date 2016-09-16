/**
 * Created by Juan on 6/4/14.
 */

requirejs.config({
    paths: {
        async: [
            '//cdnjs.cloudflare.com/ajax/libs/requirejs-async/0.1.1/async',
            'vendor/requirejs/async'
        ],
        jquery: [
            '//cdnjs.cloudflare.com/ajax/libs/jquery/2.1.1/jquery.min',
            'vendor/jquery/jquery.min'
        ],
        bootstrap: [
            '//netdna.bootstrapcdn.com/bootstrap/3.3.7/js/bootstrap.min',
            'vendor/bootstrap/bootstrap.min'
        ],
        d3: ['//cdnjs.cloudflare.com/ajax/libs/d3/3.4.6/d3.min',
            'vendor/d3/d3.min'
        ],
        d3_nvd3: [
            '//cdnjs.cloudflare.com/ajax/libs/nvd3/1.1.15-beta/nv.d3.min',
            'vendor/d3/nv.d3.min'
        ],
        queue:'http://d3js.org/queue.v1.min',
        topojson:'http://d3js.org/topojson.v1.min',
        underscore: [
            '//cdnjs.cloudflare.com/ajax/libs/underscore.js/1.6.0/underscore-min',
            'vendor/underscore/underscore-min'
        ],
        custom_tooltip: 'customtooltip',
        csvjson:'csvjson'
    },
    shim: {
        bootstrap: { deps: ['jquery'] },
        bootstrap_datepicker: { deps: ['bootstrap'] },
        d3_nvd3: { deps: ['d3_global'] }
    }
});

define('generalLibraries', ['jquery', 'bootstrap']);
define('d3Libraries', ['d3', 'd3_nvd3', 'queue', 'custom_tooltip', 'topojson']);
define('mapLibraries', ['async!https://maps.googleapis.com/maps/api/js?v=3&key=AIzaSyANPfBBVteHSTx4o9O-kgjC8RVMuXW0O2o&sensor=false&libraries=geometry']);

define('d3_global', ['d3'], function(d3Module) {
    window.d3 = d3Module;
});

requirejs(['visualization'], function(visualization) {
    $(document).ready(function() {
        visualization.dataFile = $('#dataFile').val();
        visualization.metadataFile = $('#metadataFile').val();
        visualization.zipcodesFile = $('#zipcodesFile').val();
        visualization.loadData();
    });
});