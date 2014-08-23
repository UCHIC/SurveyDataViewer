/**
 * Created by Juan on 6/4/14.
 */

requirejs.config({
    paths: {
        jquery: '//cdnjs.cloudflare.com/ajax/libs/jquery/2.1.1/jquery.min',
        bootstrap: '//netdna.bootstrapcdn.com/bootstrap/3.1.1/js/bootstrap.min',
        d3: '//cdnjs.cloudflare.com/ajax/libs/d3/3.4.6/d3.min',
        d3_nvd3: '//cdnjs.cloudflare.com/ajax/libs/nvd3/1.1.15-beta/nv.d3.min',
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
define('d3Libraries', ['d3', 'd3_nvd3', 'csvjson', 'custom_tooltip']);

define('d3_global', ['d3'], function(d3Module) {
    window.d3 = d3Module;
});

requirejs(['visualization'], function(visualization) {
    $(document).ready(function() {
        visualization.dataFile = $('#dataFile').val();
        visualization.metadataFile = $('#metadataFile').val();
        visualization.loadData();
    });
});