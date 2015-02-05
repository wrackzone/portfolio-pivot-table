/** this class is configured with { series : [] } where series is a single dimensional array of 
    data values that is filled to full extent of the date range with future values filled with 
    nulls.
**/
Ext.define("FeatureRollUp", function() {

    var self;

    return {
        config : {
                type : '',
                operation : null,
                attrName : '',
                aggregator : null
        },

        constructor:function(config) {
            self = this;
            this.initConfig(config);
            return this;
        },

        fillFeatures : function( features, callback ) {

            var that = this;

            var configs = _.map( features, function(feature) {
                return { 
                    feature : feature.get("ObjectID"), 
                    type : that.type,
                    // fields : that.fields,
                    operation : that.operation,
                    attrName : that.attrName
                };
            });

            // console.log("config",_.first(configs));

            async.map(configs, that.rollUp, function(error,result) {
                _.each(features,function(feature,i) {
                    feature.set(that.attrName,result[i]);
                });
                callback(null,true);
            });

        },

        rollUp : function( config, callback ) {

            var that = this;
        
            var hydrate = ['_TypeHierarchy'];
            var fetch = hydrate.concat(config.operation.fields);
            
            if (!_.isUndefined(config.operation.groupBy)) {
                fetch.push(config.operation.groupBy);
                hydrate.push(config.operation.groupBy);
            }

            var cfg = {
                find : {
                    '_TypeHierarchy' : { "$in" : _.isArray(config.type) ? config.type : [config.type] },
                    '_ItemHierarchy' : { "$in" : [config.feature] },
                    __At : 'current'
                },
                hydrate : hydrate,
                fetch : fetch
            };

            // eg. Blocked grouped by Block return count for True / False
            var groupTotals = function(snapshots,config) {
                var grouped = _.groupBy( snapshots, function( snap ) {
                    return snap.get(config.operation.groupBy);
                });
                var field = _.first(config.operation.fields)  // we only group by a single field
                var keys = _.keys(grouped);
                var totals = _.map( keys, function(key) {
                    var keySnapshots = grouped[key];
                    switch( config.operation.operator ) {
                        case 'count':
                            return keySnapshots.length; break;
                        case 'sum': 
                            return _.reduce( keySnapshots, function(memo,s) {
                                return memo + (_.isNumber(s[field]) ? parseFloat(s[field]):0);
                            });
                            val = memo + fv; break;
                        default : 
                            console.log("no valid operator specified",config.operation);
                    };
                });
                return _.zipObject(keys,totals);

            };

            // eg. Task Estimate
            var operationTotals = function(snapshots,config) {
                var totals = _.map( config.operation.fields, function(f) {
                    return _.reduce( snapshots, function(memo,s) {
                        var val = null; var fv = s.get(f) ? parseFloat(s.get(f)) : 0;
                        switch( config.operation.operator ) {
                            case 'sum': 
                                val = memo + fv; break;
                            case 'count':
                                val = memo + 1; break;
                            default : 
                                console.log("no valid operator specified",config.operation);
                        };
                        return val;
                    },0);
                });
                return _.zipObject(config.operation.fields,totals);
            };

            self.readSnapshots(cfg, function(error,snapshots) {
                var totals = _.isUndefined(config.operation.groupBy) ? 
                    operationTotals(snapshots,config) :
                            groupTotals( snapshots, config);
                callback(null,totals);
            });
        },

        readSnapshots : function( config, callback) {
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
        }


    };  
});
