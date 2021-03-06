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
			cols: 'InvestmentCategory',
			customFields : 'Cost,CustomerRequests',
			customFieldsType : 'HierarchicalRequirement'
		}
	},
	// items:{ html:'<a href="https://help.rallydev.com/apps/2.0rc2/doc/">App SDK 2.0rc2 Docs</a>'},
	launch: function() {
		//Write app code here
		app = this;

		app.customFields = app.getSetting('customFields');
		app.customFieldsType = app.getSetting('customFieldsType');

		app.rollups = [ 
			{
				summary : Ext.create("FeatureRollUp", {
		            type : 'Task',
		            operation : { operator : 'sum', fields : ["Estimate","ToDo","Actuals"] },
		            attrName : 'TaskSummary',
		            aggregator : aggregator("TaskSummary")
				}) 
			},
			{
				summary : Ext.create("FeatureRollUp", {
		            type : 'Defect',
		            operation : { operator : 'count', fields : ["FormattedID"], groupBy : 'State' },
		            attrName : 'DefectSummary',
		            aggregator : aggregator("DefectSummary")
				}) 
			},
			{
				summary : Ext.create("FeatureRollUp", {
		            type : 'TestCase',
		            operation : { operator : 'count', fields : ["FormattedID"] },
		            attrName : 'TestCaseSummary',
		            aggregator : aggregator("TestCaseSummary")
				}) 
			},
			{
				summary : Ext.create("FeatureRollUp", {
		            type : ['HierarchicalRequirement','Defect','Task'],
		            operation : { operator : 'count', fields : ["FormattedID"], groupBy : 'Blocked' },
		            attrName : 'BlockedSummary',
		            aggregator : aggregator("BlockedSummary")
				}) 
			}
		];

		app.addCustomFieldRollup(app.rollups,app.customFields,app.customFieldsType);

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
		app.loadProjectInfo();
	},

	addCustomFieldRollup : function(rollups,customFields,customFieldsType) {
		if (!_.isNull(customFields) && !_.isNull(customFieldsType) &&
			customFields !== "" && customFieldsType !== "" && customFields.split(",").length>0) {
				var fields = _.map( customFields.split(","),function(f){
					return "c_" + f;
				});
				rollups.push({
					summary : Ext.create("FeatureRollUp", {
			            type : [customFieldsType],
			            operation : { operator : 'sum', fields : fields },
			            attrName : 'CustomFieldsSummary',
			            aggregator : aggregator("CustomFieldsSummary")
					}) 
				});
		}
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
			},
			{
				name: 'customFields',
				xtype: 'rallytextfield'
			}
		];
	},

	loadProjectInfo : function() {

		var configs = [ 
			{
				model : "Project",
				fetch : ["Name","ObjectID"]
			},
			{ 
				model : "PreliminaryEstimate", 
				fetch : ['Name','ObjectID','Value'], 
				filters : [] 
        	},
        	{ 
    			model : "TypeDefinition",
				fetch : true,
				filters : [ { property:"TypePath", operator:"contains", value:'PortfolioItem'} ]
        	}
		];

		async.map(configs,app.wsapiQuery,function(err,results) {
			app.projects = results[0];
			app.preliminaryEstimates = results[1];
			app.portfolioItemTypes = results[2];
			console.log("projects",app.projects,app.preliminaryEstimates,app.portfolioItemTypes);
			app.readPortfolioItems();
		});

	},

	createConfigForPortfolioType : function(type) {

		var projects = _.map(app.projects,function(p) { return p.get("ObjectID");});

		return {
			fetch : ['Name','_UnformattedID','ObjectID','_TypeHierarchy', '_ItemHierarchy',
						'InvestmentCategory','PortfolioItemType','State','Owner','Project','Parent',
						'Release','FormattedID','PreliminaryEstimate'
					],
			hydrate : ['_TypeHierarchy','State','PortfolioItemType','InvestmentCategory','Release','PreliminaryEstimate'],
			pageSize:1000,
			find : {
				'_TypeHierarchy' : { "$in" : [type]},
				'_ProjectHierarchy' : { "$in" : [app.getContext().getProject()["ObjectID"]]},
				// 'Project' : { "$in": projects }, 
				__At : 'current'
			}
		};
	},

	readPortfolioItems : function() {

		var types = _.filter(app.portfolioItemTypes, function(t) {
			return t.get("Ordinal") >= 0;
		});

		var typePaths = _.map(types,function(t){
			return t.get("TypePath");
		});

		var configs = _.map( typePaths , function(type) {
			return app.createConfigForPortfolioType(type);
		});

		async.mapSeries( configs, app.readSnapshots, function(err,results) {
			console.log("readPortfolioItems Results:",results);
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

		async.map(app.rollups,
			function(rollup,callback) {
				rollup.summary.fillFeatures(features,function(error,success) {
					callback(null,success);
				});
			},
			function(error,results) {
				console.log("success",results);
				app.pivotTable(features);
			}
		);
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

	addCommas : function(nStr) {
            var rgx, x, x1, x2;
            nStr += '';
            x = nStr.split('.');
            x1 = x[0];
            x2 = x.length > 1 ? '.' + x[1] : '';
            rgx = /(\d+)(\d{3})/;
            while (rgx.test(x1)) {
              x1 = x1.replace(rgx, '$1' + ',' + '$2');
            }
            return x1 + x2;
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
		var releaseDeriver = function(record) {
			return record.Release.Name;
		};
		var preliminaryEstimateDeriver = function(record) {
			var pe = _.find(app.preliminaryEstimates,function(p) {
				return p.get("ObjectID") === record.PreliminaryEstimate
			});
			// console.log("value",pe ? pe.get("Value") : "none");
			return (!_.isUndefined(pe) && !_.isNull(pe)) ? pe.get("Value") : 0;
		};

		var derived = {
			"Initiative" : initDeriver,
			"OwnerName" : ownerDeriver,
			"Release" : releaseDeriver,
			"PreliminaryEstimateValue" : preliminaryEstimateDeriver
		};   

		var aggNames = _.map(app.rollups, function(r) { return r.summary.attrName; });
		var aggs = _.map(app.rollups, function(r) { return r.summary.aggregator; });
		var aggregators = _.zipObject(aggNames, aggs);

		var hidden = ["Project","Owner","ObjectID","_TypeHierarchy","_UnformattedID","_ValidFrom","_ValidTo","PortfolioItemType","_ItemHierarchy", "PreliminaryEstimate"]; 
		var attrNames = _.map(app.rollups,function(rollup){return rollup.summary.attrName;});
		hidden = hidden.concat(attrNames);

		$(app.jqPanel).pivotUI(
			data,                    
			{
				derivedAttributes : derived,
				aggregators : aggregators,
				cols: cols,
				rows: rows,
				hiddenAttributes : hidden
			}
		);

		app.mask.hide();

	},

	readSnapshots : function( config, callback) {
		console.log("reading page of snapshots...",config);
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

