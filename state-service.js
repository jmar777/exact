var _ = require('lodash');

var StateService = module.exports = Object.create(null, {
	_cache: { writable: true, configurable: true, value: Object.create(null) }
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
	// capture and cache these now
	var defaultProps = definition.getDefaultProps ?
			definition.getDefaultProps() : Object.create(null);

	return Object.create({
		create: function(props) {
			return createServiceInstance(this, props);
		},
		mixin: function(opts) {
			return createServiceMixin(this, opts);
		}
	}, {
		factoryId: { value: 'factory-' + largeRandomNumber() },
		definition: { value: definition },
		defaultProps: { value: defaultProps }
	});
};

function createServiceInstance(factory, props) {
	var definition = factory.definition;

	// before we create a new one, check if we need to return a cached instance
	props = _.assign({}, factory.defaultProps, props);

	var uniqueKey = definition.getUniqueKey ? definition.getUniqueKey(props) : null;

	// scope it to the factory
	if (uniqueKey) {
		uniqueKey = factory.factoryId + '::' + uniqueKey;
	}

	var serviceInstance;

	// return a cached instance, if appropriate
	if (uniqueKey) {
		serviceInstance = StateService.cache(uniqueKey);
		if (serviceInstance) {
			return serviceInstance;
		}
	}

	// we need to create a new one
	var proto = _.assign(
		// create a new prototype object
		{},
		// ...that includes all of our default prototype methods
		defaultServiceInstanceProto,
		// ...and all provided methods (other than the lifecycle hooks)
		_.omit(definition, [
			'getDefaultProps',
			'getUniqueKey',
			'getInitialState',
			'registeredComponentWillMount',
			'registeredComponentDidMount',
			'registeredComponentWillUnmount'
		])
	);

	serviceInstance = Object.create(proto, {
		props: { writable: true, configurable: true, value: props },
		state: { writable: true, configurable: true },
		_uuid: { value: 'state-service-' + largeRandomNumber() },
		_registeredComponents: { value: Object.create(null) },
		registeredComponentsCount: { writable: true, configurable: true, value: 0 }
	});

	serviceInstance.state = _.assign(
		Object.create(null),
		definition.getInitialState ? definition.getInitialState.apply(serviceInstance) : {}
	);

	if (uniqueKey) {
		StateService.cache(uniqueKey, serviceInstance)
	}

	return serviceInstance;
}

var defaultServiceInstanceProto = {
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

		this.registeredComponentsCount++;

		return this;
	},
	deregisterComponent: function(component, keys) {
		this.destroyComponentData(component);
		this.registeredComponentsCount--;
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
			componentUuid = component[this._uuid + '-id'] = largeRandomNumber();
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
	opts || (opts = {});
	Array.isArray(opts) && (opts = { key: opts });

	var definition = factory.definition,
		service;

	// make sure hooks only get called once...
	var willMountInvoked = false,
		didMountInvoked = false,
		willUnmountInvoked = false;

	return {
		getInitialState: function() {
			var props = this.props;

			if (definition.mapProps) {
				props = definition.mapProps(props);
			}

			service = factory.create(props);

			service.registerComponent(this, opts.keys);

			if (opts.ref) {
				this.serviceRefs || (this.serviceRefs = {});
				this.serviceRefs[opts.ref] = service;
			}

			return service.getState(opts.keys);
		},
		componentWillMount: function() {
			if (willMountInvoked) return;
			willMountInvoked = true;
			service.registeredComponentWillMount &&
				service.registeredComponentWillMount();
		},
		componentDidMount: function() {
			if (didMountInvoked) return;
			didMountInvoked = true;
			service.registeredComponentDidMount &&
				service.registeredComponentDidMount();
		},
		componentWillUnmount: function() {
			if (this.registeredComponentsCount === 1 && !willUnmountInvoked) {
				willUnmountInvoked = true;
				service.registeredComponentWillUnmount &&
					service.registeredComponentWillUnmount();
			}

			// @todo: maybe we should do a setTimeout, and then deregister, to
			// let component code still have access the service here
			service.deregisterComponent(this);

			if (opts.ref) {
				delete this.serviceRefs[opts.ref];
			}
		}
	};
}

function largeRandomNumber() {
	return Math.ceil(Math.random() * 999999999999);
}
