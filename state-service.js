var _ = require('lodash');

var StateService = module.exports = Object.create(null, {
	_cache: { writable: true, value: Object.create(null) }
});

// the cache is used for sharing the same state-services across multiple
// components (coordinated based on some cache key). Client-side we never have
// to worry about clearing the cache, but server-side it needs to be reset
// before each render (see boot-client.js).
StateService.cache = function(key, val) {
	if (arguments.length === 1) {
		return this._cache[key];
	}
	this._cache[key] = val;
};

StateService.clearCache = function() {
	// @todo: i don't think we need to manually delete keys to avoid memory
	// leaks, but we should test it to be sure
	this._cache = Object.create(null);
};

StateService.createFactory = function(definition) {
	return createServiceFactory(definition);
};

function createServiceFactory(definition) {
	return Object.create({
		create: function(cacheKey, props) {
			// cacheKey is optional
			if (arguments.length === 1) {
				props = cacheKey;
				cacheKey = undefined;
			}

			var service;
			if (cacheKey) {
				service = StateService.cache(cacheKey);
				if (!service) {
					service = createServiceInstance(definition, props);
					StateService.cache(cacheKey, service);
				}
			} else {
				service = createServiceInstance(definition, props);
			}

			return service;
		},
		mixin: function(opts) {
			opts || (opts = {});
			Array.isArray(opts) && (opts = { keys: opts });
			// @todo: handle opts.cacheKey
			return createServiceMixin(this, opts);
		}
	});
}

function createServiceInstance(definition, props) {
	var proto = _.assign(
		// create a new prototype object
		{},
		// ...that includes all of our default prototype methods
		serviceInstanceProto,
		// ...and all provided methods (other than the lifecycle hooks)
		_.omit(definition, ['getDefaultProps', 'getInitialState'])
	);

	var service = Object.create(proto, {
		props: { writable: true, configurable: true, value: Object.create(null) },
		state: { writable: true, configurable: true, value: Object.create(null) },
		_uuid: { value: 'state-service-' + Math.ceil(Math.random() * 999999999999) },
		_registeredComponents: { value: Object.create(null) }
	});

	// @todo: react caches the result of `getDefaultProps()`, so subsequent
	// instances don't have to re-run it. we should probably follow this convention
	service.props = _.assign(
		service.props,
		definition.getDefaultProps.apply(service),
		props
	);

	service.state = _.assign(service.state, definition.getInitialState.apply(service));

	return service;
}

var serviceInstanceProto = {
	registerComponent: function(component, keys) {
		var self = this,
			data = this.getComponentData(component);

		// store a quick lookup map of all the keys that this component is tracking
		data.keyMap = Object.create(null);
		(keys || Object.keys(this.state)).forEach(function(key) {
			data.keyMap[key] = true;
		});

		// ...and store a reference to the component itself
		data.component = component;

		return this;
	},
	deregisterComponent: function(component, keys) {
		this.destroyComponentData(component);
	},
	getState: function(keys) {
		return _.pick(this.state, keys || Object.keys(this.state));
	},
	setState: function(state) {
		var self = this;

		if (!state || typeof state !== 'object') {
			throw new Error('setState(state) requires state to be an object');
		}

		// update our local state copy
		_.assign(this.state, state);

		// loop through our registered components and apply state changes
		Object.keys(this._registeredComponents).forEach(function(id) {
			var data = self._registeredComponents[id],
				keyMap = data.keyMap,
				component = data.component;

			// create a new state object using only the keys each component is tracking
			var newState = {};
			Object.keys(state).forEach(function(key) {
				keyMap[key] && (newState[key] = state[key]);
			});

			component.setState(newState);
		});
	},
	getComponentData: function(component) {
		// first get the component's uuid
		var componentUuid = component[this._uuid + '-id'];
		if (!componentUuid) {
			componentUuid = component[this._uuid + '-id'] = Math.ceil(Math.random() * 999999999999);
		}

		// then get the component's data
		var data = this._registeredComponents[componentUuid];
		if (!data) {
			data = this._registeredComponents[componentUuid] = Object.create(null);
		}

		return data;
	},
	destroyComponentData: function(component) {
		// first get the component's uuid
		var componentUuid = component[this._uuid + '-id'];
		if (componentUuid) {
			delete this._registeredComponents[componentUuid];
			delete component[this._uuid + '-id'];
		}

		return this;
	}
};

function createServiceMixin(factory, opts) {
	var service;

	return {
		getInitialState: function() {
			if (opts.cacheKey) {
				service = factory.create(opts.cacheKey, this.props);
			} else {
				service = factory.create(this.props);
			}
			service.registerComponent(this, opts.keys);

			if (opts.ref) {
				this.serviceRefs || (this.serviceRefs = {});
				this.serviceRefs[opts.ref] = service;
			}

			return service.getState(opts.keys);
		},
		componentWillUnmount: function() {
			// @todo: maybe we should do a setTimeout, and then deregister, to
			// let component code still have access the service here
			service.deregisterComponent(this);

			if (opts.ref) {
				delete this.serviceRefs[opts.ref];
			}

		}
	};
}
