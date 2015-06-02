var React = require('react');

module.exports = function bootClient(opts, cb) {
	var view = opts.view;

	React.render(
		React.createElement(view, window.__EXACT_PROPS__),
		document,
		cb
	);
};
