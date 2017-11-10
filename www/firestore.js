var exec = require('cordova/exec');
var utils = require("cordova/utils");

var PLUGIN_NAME = 'Firestore';

function Firestore(persist, datePrefix) {
  if (datePrefix === undefined) {
    this.datePrefix = "__DATE(";
  } else {
    this.datePrefix = datePrefix;
  }

  if (persist === undefined) {
    persist = true;
  }
  exec(function() {}, null, PLUGIN_NAME, 'initialise', [persist]);
}

Firestore.prototype = {
  get: function() {
    return this;
  },
  collection: function(path) {
    return new CollectionReference(path);
  }
};

function Query(ref, queryType, value) {
  this._ref = ref;
  this._ref._queries.push({
    "queryType": queryType,
    "value": value
  });
}

Query.prototype = {
  endAt: function(snapshotOrVarArgs) {
    return new Query(this._ref, "endAt", snapshotOrVarArgs);
  },
  endBefore: function(snapshotOrVarArgs) {
    return new Query(this._ref, "endBefore", snapshotOrVarArgs);
  },
  limit: function(limit) {
    return new Query(this._ref, "limit", limit);
  },
  orderBy: function(field, direction) {
    if (direction === undefined) {
      direction = "ASCENDING";
    }

    var orderByField = {
      "field": field,
      "direction": direction
    };
    return new Query(this._ref, "orderBy", orderByField);
  },
  get: function() {
    var args = [this._ref._path, this._ref._queries];

    return new Promise(function(resolve, reject) {
      exec(resolve, reject, PLUGIN_NAME, 'collectionGet', args);
    }).then(function(data) {
      return new QuerySnapshot(data);
    });
  },
  onSnapshot: function(callback, options) {
    var args = [this._ref._path, this._ref._queries, options];

    var resolved = false;
    callback.$listenerId = utils.createUUID();

    return new Promise(function(resolve, reject) {
      exec(function(data) {
        var snapshot = new QuerySnapshot(data);
        callback(snapshot);
        if (!resolved) {
          resolve(callback);
          resolved = true;
        }
      }, function() {}, PLUGIN_NAME, 'collectionOnShapshot', args);
    });
  },
  startAfter: function(snapshotOrVarArgs) {
    return new Query(this._ref, "startAfter", snapshotOrVarArgs);
  },
  startAt: function(snapshotOrVarArgs) {
    return new Query(this._ref, "startAt", snapshotOrVarArgs);
  },
  where: function(fieldPath, opStr, passedValue) {
    var value;
    if (passedValue instanceof Date) {
      value = "__DATE(" + passedValue.getTime() + ")";
    } else {
      value = passedValue;
    }
    var whereField = {
      "fieldPath": fieldPath,
      "opStr": opStr,
      "value": value
    };
    return new Query(this._ref, "where", whereField);
  }
};

function CollectionReference(path, id) {
  this._path = path;
  this._id = id;
  this._ref = this;
  this._queries = [];
}

CollectionReference.prototype = Object.create(Query.prototype, {
  firestore: {
    get: function() {
      throw "CollectionReference.firestore: Not supported";
    }
  },
  id: {
    get: function() {
      return this._id;
    }
  },
  parent: {
    get: function() {
      throw "CollectionReference.parent: Not supported";
    }
  }
});

CollectionReference.prototype.add = function(data) {
  var args = [this._path, data];

  return new Promise(function(resolve, reject) {
    exec(resolve, reject, PLUGIN_NAME, 'collectionAdd', args);
  });
};

CollectionReference.prototype.doc = function(id) {
  return new DocumentReference(this, id);
}

function DocumentReference(collectionReference, id) {
  this._id = id;
  this._collectionReference = collectionReference;
}

DocumentReference.prototype = {
  _isFunction: function(functionToCheck) {
    var getType = {};
    return functionToCheck && getType.toString.call(functionToCheck) === '[object Function]';
  },
  collection: function(collectionPath) {
    throw "DocumentReference.collection(): Not supported";
  },
  delete: function() {
    throw "DocumentReference.delete(): Not supported";
  },
  get: function() {
    var args = [this._collectionReference._path, this._id];

    return new Promise(function(resolve, reject) {
      exec(resolve, reject, PLUGIN_NAME, 'docGet', args);
    }).then(function(data) {
      return new DocumentSnapshot(data);
    });
  },
  onSnapshot: function(optionsOrObserverOrOnNext, observerOrOnNextOrOnError, onError) {
    var args = [this._collectionReference._path, this._id];

    if (!this._isFunction(optionsOrObserverOrOnNext)) {
      args.push(optionsOrObserverOrOnNext);
    }
    var wrappedCallback;

    if (this._isFunction(optionsOrObserverOrOnNext)) {
      wrappedCallback = function(documentSnapshot) {
        optionsOrObserverOrOnNext(new DocumentSnapshot(documentSnapshot));
      };
    } else if (this._isFunction(observerOrOnNextOrOnError)) {
      wrappedCallback = function(documentSnapshot) {
        observerOrOnNextOrOnError(new DocumentSnapshot(documentSnapshot));
      };
    } else {
      wrappedCallback = function(documentSnapshot) {};
    }
    return new Promise(function(resolve, reject) {
      exec(wrappedCallback, function() {}, PLUGIN_NAME, 'docOnShapshot', args);
    }.bind(this));
  },
  set: function(data, options) {

    var args = [this._collectionReference._path, this._id, data, options];

    return new Promise(function(resolve, reject) {
      exec(resolve, reject, PLUGIN_NAME, 'docSet', args);
    });
  },
  update: function(data) {

    var args = [this._collectionReference._path, this._id, data];

    return new Promise(function(resolve, reject) {
      exec(resolve, reject, PLUGIN_NAME, 'docUpdate', args);
    });
  }
};


Object.defineProperties(DocumentReference.prototype, {
  firestore: {
    get: function() {
      throw "DocumentReference.firestore: Not supported";
    }
  },
  id: {
    get: function() {
      return this._id;
    }
  },
  parent: {
    get: function() {
      return this._collectionReference;
    }
  }
});

function DocumentSnapshot(data) {
  this._data = data;

  if (data.exists) {
    var keys = Object.keys(this._data._data);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];

      if (typeof this._data._data[key] === 'string' && this._data._data[key].startsWith("__DATE(")) {
        var length = this._data._data[key].length;
        var wrapperLength = "__DATE(".length;

        var timestamp = this._data._data[key].substr(wrapperLength, length - wrapperLength - 1);

        this._data._data[key] = new Date(parseInt(timestamp));
      }
    }
  }
}

DocumentSnapshot.prototype = {
  _fieldPath: function(obj, i) {
    return obj[i];
  },
  data: function() {
    return this._data._data;
  },
  get: function(fieldPath) {
    return fieldPath.split('.').reduce(this._fieldPath, this._data);
  }
};

Object.defineProperties(DocumentSnapshot.prototype, {
  exists: {
    get: function() {
      return this._data.exists;
    }
  },
  id: {
    get: function() {
      return this._data.id;
    }
  },
  metadata: {
    get: function() {
      throw "DocumentReference.metadata: Not supported";
    }
  },
  ref: {
    get: function() {
      return this._data.ref;
    }
  }
});


function QuerySnapshot(data) {
  this._data = data;
}

QuerySnapshot.prototype = {
  forEach: function(callback, thisArg) {
    var keys = Object.keys(this._data.docs);
    for (var i = 0; i < keys.length; i++) {
      callback(new DocumentSnapshot(this._data.docs[i]));
    }
  }
};

Object.defineProperties(QuerySnapshot.prototype, {
  docChanges: {
    get: function() {
      throw "QuerySnapshot.docChanges: Not supported";
    }
  },
  docs: {
    get: function() {
      return this._data.docs;
    }
  },
  empty: {
    get: function() {
      return this._data.docs.length === 0;
    }
  },
  metadata: {
    get: function() {
      throw "QuerySnapshot.metadata: Not supported";
    }
  },
  query: {
    get: function() {
      throw "QuerySnapshot.query: Not supported";
    }
  },
  size: {
    get: function() {
      return this._data.docs.length;
    }
  }
});
module.exports = {
  initialise: function() {
    return new Firestore();
  }
};
