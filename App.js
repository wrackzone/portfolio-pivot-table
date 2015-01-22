var app = null;
// var types = ["PortfolioItem/Feature","PortfolioItem/Initiative","PortfolioItem/Theme"];
var types = ["PortfolioItem/Feature","PortfolioItem/Initiative"];

Ext.define('CustomApp', {
	extend: 'Rally.app.App',
	settingsScope: 'app',
	componentCls: 'app',
	config: {
		defaultSettings: {
			rows: 'Initiative',
			cols: 'InvestmentCategory'
		}
	},
	// items:{ html:'<a href="https://help.rallydev.com/apps/2.0rc2/doc/">App SDK 2.0rc2 Docs</a>'},
	launch: function() {
		//Write app code here
		app = this;

		var panel = Ext.create('Ext.container.Container', {
					itemId : 'panel',
					title: 'Hello',
					html: '<p></p>'
		});

		// read the saved settings.
		app.settingsRows = app.getSetting('rows');
		app.settingsCols = app.getSetting('cols');

		this.add(panel);
		var p = this.down("#panel");
		app.jqPanel = "#"+p.id;

		app.mask = new Ext.LoadMask(Ext.getBody(), {msg:"Please wait..."});
		app.mask.show();
		app.loadProjects();
	},

	getSettingsFields: function() {
		return [
			{
				name: 'rows',
				xtype: 'rallytextfield'
			},
			{
				name: 'cols',
				xtype: 'rallytextfield'
			}
		];
	},

	loadProjects : function() {

		var configs = [ {
			model : "Project",
			fetch : ["Name","ObjectID"]
		} ];

		async.map(configs,app.wsapiQuery,function(err,results) {
			app.projects = results[0];
			app.readPortfolioItems();
		});

	},

	createConfigForPortfolioType : function(type) {

		var projects = _.map(app.projects,function(p) { return p.get("ObjectID");});

		return {
			fetch : ['Name','_UnformattedID','ObjectID','_TypeHierarchy','c_STO', '_ItemHierarchy',
						'InvestmentCategory','PortfolioItemType','State','Owner','Project','Parent'
					],
			hydrate : ['_TypeHierarchy','State','PortfolioItemType','InvestmentCategory'],
			pageSize:1000,
			find : {
				'_TypeHierarchy' : { "$in" : [type]} ,
				'Project' : { "$in": projects }, 
				__At : 'current'
			}
		};
	},

	readPortfolioItems : function() {

		var configs = _.map( types, function(type) {
			return app.createConfigForPortfolioType(type);
		});

		async.mapSeries( configs, app.readSnapshots, function(err,results) {

			app.addThemesToFeatures(results[0],results[1]);

		});
	},

	addThemesToFeatures : function(features,initiatives) {

		app.addOwners(features);
		app.addTeamNames(features);

		_.each(features, function(f){
			var initiative = _.find( initiatives, function(i) { 
				return f.get("Parent") === i.get("ObjectID");
			});
			f.set("Initiative", initiative  ? initiative.get("Name") : "None");
		});


	},

	cleanUpFieldNames : function(features) {

		_.each( features, function(f,i) {
			var keys = _.keys(f);

			keys = _.filter(keys,function(k){
				return k.substring(0,2) === "c_";
			});
			_.each(keys,function(k){
				var newKey = k.substring(2);
				f[newKey] = f[k];
				delete f[k];
			});
		});

		return features;

	},

	addTeamNames : function(features) {

		_.each( features, function(f) {
			var p = _.find(app.projects,function(pr) { 
				return pr.get("ObjectID")=== f.get("Project");
			});
			f.set("Team",p.get("Name"));
		});

		app.pivotTable(features);

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
			_.each(features,function(f) {
				var ownerName = _.find(app.owners,function(o) {
					return (o.get("ObjectID") === f.get("Owner"));
				});
				if (ownerName !== undefined && ownerName !== null) 
					f.set("OwnerName",
						ownerName.get("DisplayName")!==null && ownerName.get("DisplayName").length > 0 ? ownerName.get("DisplayName") : ownerName.get("UserName") );
				else
					f.set("OwnerName","");
			});
			app.addTeamNames(features);
		});
	},


	pivotTable : function(features) {

		var rows = app.settingsRows.split(",");
		var cols = app.settingsCols.split(",");
		console.log("rows:",rows,"cols:",cols);

		var data = _.map(features,function(s) { 
			return s.data;
		});

		data = app.cleanUpFieldNames(data);

		var initDeriver = function(record) {
			return record.Initiative;
		};
		var ownerDeriver = function(record) {
			return record.OwnerName;
		};


		var derived = {
			"Initiative" : initDeriver,
			"OwnerName" : ownerDeriver
		};   


		$(app.jqPanel).pivotUI(
			data,                    
			{
				derivedAttributes : derived,
				// aggregators : { cycleTime : cycleTime },
				// cols: ["InvestmentCategory"],
				// rows: ["Initiative"],
				cols: cols,
				rows: rows,
				hiddenAttributes : ["Project","Owner","ObjectID","_TypeHierarchy","_UnformattedID","_ValidFrom","_ValidTo","PortfolioItemType","_ItemHierarchy"]
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

