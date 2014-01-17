var app = null;
// var types = ["PortfolioItem/Feature","PortfolioItem/Initiative","PortfolioItem/Theme"];
var types = ["PortfolioItem/Feature"];

Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    // items:{ html:'<a href="https://help.rallydev.com/apps/2.0rc2/doc/">App SDK 2.0rc2 Docs</a>'},
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

        app.mask = new Ext.LoadMask(Ext.getBody(), {msg:"Please wait..."});
        app.mask.show();
        this.readPortfolioItems();
    },

    createConfigForPortfolioType : function(type) {

	    return {
	        fetch : ['Name','_UnformattedID','ObjectID','_TypeHierarchy','c_STO', '_ItemHierarchy',
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
    },

    readPortfolioItems : function() {

    	var configs = _.map( types, function(type) {
        	return app.createConfigForPortfolioType(type);
        })

        async.mapSeries( configs, app.readSnapshots, function(err,results) {

       		console.log("results",results);

       		app.addThemesToFeatures(results[0]);

        });
    },

    addThemesToFeatures : function(features) {

    	var themeIds = _.map(features,function(f) {
    		var ih = f.get("_ItemHierarchy");
    		if (ih.length===3)
    			return ih[0];
    		else
    			return null;
    	});
    	themeIds = _.compact(themeIds);
    	themeIds = _.uniq(themeIds);
    	console.log("distinct themes",themeIds);

	    var themeConfig = {
	        fetch : ['Name','_UnformattedID','ObjectID','_TypeHierarchy','c_STO', '_ItemHierarchy',
	        			'InvestmentCategory','PortfolioItemType','State','Owner'
	        		],
	        hydrate : ['_TypeHierarchy','State','PortfolioItemType','InvestmentCategory'],
	        pageSize:1000,
	        find : {
	            '_TypeHierarchy' : { "$in" : ["PortfolioItem/Theme"]} ,
	            '_ProjectHierarchy' : { "$in": app.getContext().getProject().ObjectID }, 
	            __At : 'current'
	        },
	    };

	    async.mapSeries( [themeConfig], app.readSnapshots, function(err,results) {
	    	app.themes = results[0];

	    	_.each(features,function(f) {
	    		var th = f.get("_ItemHierarchy");
    			if (th.length===3) {
	    			var themeid = th[0];
	    			var theme = _.find(app.themes, function(t) { 
	    				return t.get("ObjectID") === themeid; 
	    			});
		    		f.set("Theme",theme.get("Name"));
	    		} else {
	    			f.set("Theme","");
	    		}
	    	});
	    	app.addOwners(features);
	    });

    },

    addOwners : function(features) {

    	var ownerIds = _.map(features,function(f) {
    		var o = f.get("Owner");
    		if (o !== undefined && o !== null)
    			return o;
    		else
    			return null;
    	});
    	ownerIds = _.compact(ownerIds);
    	ownerIds = _.uniq(ownerIds);
    	console.log("distinct owners",ownerIds);

    	var configs = _.map(ownerIds, function(o) {
    		return { 
    			model : "User",
        	    fetch : ["UserName","DisplayName"],
	            filters : [{property:"ObjectID",value:o}]
            };
    	});

    	async.map(configs,app.wsapiQuery,function(err,results) {
    		app.owners = _.pluck( results, function(r) { return r[0];});
    		app.owners = _.compact(app.owners);
    		console.log("owners",app.owners);
    		_.each(features,function(f) {
    			var ownerName = _.find(app.owners,function(o) {
    				return (o.get("ObjectID") === f.get("Owner"));
    			})
    			if (ownerName !== undefined && ownerName !== null) 
    				f.set("OwnerName",
    					ownerName.get("DisplayName")!==null && ownerName.get("DisplayName").length > 0
    						? ownerName.get("DisplayName") 
    						: ownerName.get("UserName") );
    			else
    				f.set("OwnerName","");
    		});
	    	app.pivotTable(features);
    	});
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
                cols: ["InvestmentCategory"],
                hiddenAttributes : ["Owner","ObjectID","_TypeHierarchy","_UnformattedID","_ValidFrom","_ValidTo","PortfolioItemType","_ItemHierarchy"]
            }
        );

        app.mask.hide();

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

    wsapiQuery : function( config , callback ) {
        Ext.create('Rally.data.WsapiDataStore', {
            autoLoad : true,
            limit : "Infinity",
            model : config.model,
            fetch : config.fetch,
            filters : config.filters,
            // context: config.context,
            listeners : {
                scope : this,
                load : function(store, data) {
                    callback(null,data);
                }
            }
        });
    }

});
