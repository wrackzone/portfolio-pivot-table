/** this class is configured with { series : [] } where series is a single dimensional array of 
    data values that is filled to full extent of the date range with future values filled with 
    nulls.
**/
Ext.define("FeatureRollUp", function() {

    var self;

    return {
        config : {
                type : '',
                fields : [],
                operation : '',
                attrName : '',
                aggregator : null
        },

        constructor:function(config) {
            self = this;
            this.initConfig(config);
            console.log("attr:",self.attrName);
            return this;
        },

        fillFeatures : function( features, callback ) {

            var that = this;

            var configs = _.map( features, function(feature) {
                return { 
                    feature : feature.get("ObjectID"), 
                    type : that.type,
                    fields : that.fields,
                    operation : that.operation,
                    attrName : that.attrName
                };
            });

            async.map(configs, that.rollUp, function(error,result) {
                console.log("AttrName",that.attrName);
                _.each(features,function(feature,i) {
                    feature.set(that.attrName,result[i]);
                });
                callback(null,true);
            });

        },

        rollUp : function( config, callback ) {
        
            var hydrate = ['_TypeHierarchy'];
            var cfg = {
                find : {
                    '_TypeHierarchy' : { "$in" : [config.type] },
                    '_ItemHierarchy' : { "$in" : [config.feature] },
                    __At : 'current'
                },
                hydrate : hydrate,
                fetch : hydrate.concat(config.fields)
            };

            self.readSnapshots(cfg, function(error,snapshots) {
                var totals = _.map( config.fields, function(f) {
                    return _.reduce( snapshots, function(memo,s) {
                        var val = null; var fv = s.get(f) ? parseFloat(s.get(f)) : 0;
                        switch( config.operation ) {
                            case 'sum': 
                                val = memo + fv;
                                break;
                            case 'count':
                                val = memo + 1;
                        };
                        return val;
                    },0);
                });
                callback(null,_.zipObject(config.fields,totals));
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
