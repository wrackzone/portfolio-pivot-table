var app = null;
var types = ["PortfolioItem/Feature","PortfolioItem/Initiative","PortfolioItem/Theme"];

Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    items:{ html:'<a href="https://help.rallydev.com/apps/2.0rc2/doc/">App SDK 2.0rc2 Docs</a>'},
    launch: function() {
        //Write app code here
        app = this;

		var panel = Ext.create('Ext.container.Container', {
		            itemId : 'panel',
		            title: 'Hello',
		            width: 800,
		            height: 600,
		            html: '<p></p>'
		        });

        this.add(panel);
        var p = this.down("#panel");
        app.jqPanel = "#"+p.id;

        this.readPortfolioItems();
    },

    readPortfolioItems : function() {

    	var configs = _.map( types, function(type) {
            return {
                fetch : ['_UnformattedID','ObjectID','_TypeHierarchy','c_STO', '_ItemHierarchy',
                			'InvestmentCategory','PortfolioItemType','State','Owner'
                		],
                hydrate : ['_TypeHierarchy','State','PortfolioItemType','InvestmentCategory'],
                pageSize:1000,
                find : {
                    '_TypeHierarchy' : { "$in" : [type]} ,
                    '_ProjectHierarchy' : { "$in": app.getContext().getProject().ObjectID }, 
                    __At : 'current'
                },

            }
        })

        async.mapSeries( configs, app.readSnapshots, function(err,results) {

       		console.log("results",results);

       		app.prepareResultItems(results);

        });
    },

    prepareResultItems : function ( results ) {

    	var features = results[0];
    	var themes = results[2];

    	_.each(features,function(feature) {
			// look up the theme
			console.log("feature",feature);
    		var th = feature.get("_ItemHierarchy");
    		if (th.length>2) {
    			var themeid = th[0];
    			var theme = _.find(themes, function(t) { 
    				console.log(themeid,t.get("ObjectID"),themeid===t.get("ObjectID"));
    				return t.get("ObjectID") === themeid; 
    			});
	    		feature.set("Theme",theme.get("Name"));
	    	}
    	});

    	app.pivotTable(features);

    },

    pivotTable : function(features) {

    	var data = _.map(features,function(s) { 
            return s.data;
        });

        $(app.jqPanel).pivotUI(
            data,                    
            {
                // derivedAttributes : { "Team" : teamNameDeriver, "MonthCompleted" : completedDateDeriver },
                // aggregators : { cycleTime : cycleTime },
                rows: ["Theme"],
                cols: ["Owner"],
                hiddenAttributes : ["ObjectID","_TypeHierarchy","_UnformattedID","_ValidFrom","_ValidTo","PortfolioItemType","_ItemHierarchy"]
            }
        );

    },


    readSnapshots : function( config, callback) {
        console.log("reading page of snapshots...");
         var storeConfig = {
            find : config.find,
            autoLoad : true,
            pageSize:1000,
            limit: 'Infinity',
            fetch: config.fetch,
            hydrate: config.hydrate,
            listeners : {
                scope : this,
                load: function(store, snapshots, success) {
                    callback(null,snapshots);
                }
            }
        };
        var snapshotStore = Ext.create('Rally.data.lookback.SnapshotStore', storeConfig);
    },

});
