var React = require('react'),
	_ = require('lodash'),
	StateService = require('./state-service'),
	CLIENT_VAR = '__EXACT_PROPS__';

module.exports = function createEngine(opts) {
	// default options
	opts || (opts = {});
	var doctype = opts.doctype || '<!DOCTYPE html>';

	var babelRegistered = false,
		factoryCache = Object.create(null);

	return function renderFile(filename, options, cb) {
		// defer babel registration until the first request so we can grab the view path
		if (!babelRegistered) {
			require('babel/register')({ only: options.settings.views });
			babelRegistered = true;
		}

		var props = _.omit(options, ['settings', '_locals', 'cache']);

		// this needs to be reset between each render
		StateService.reset();
		StateService.locals(props);

		try {
			// grab our cached element factory (or create a new one)
			var factory = factoryCache[filename];
			if (!factory) {
				var view = require(filename);
				factory = factoryCache[filename] = React.createFactory(view);
			}

			// render it to a string
			var element = factory(props),
				html = doctype + React.renderToString(element),
				scriptTag = buildScript(props, CLIENT_VAR);

			html = html.replace('</head>', scriptTag + '</head>');

			cb(null, html);
		} catch (err) {
			cb(err);
		}
	};
};

function buildScript(props) {
	var scriptId = 'exact-script-' + Math.ceil(Math.random() * 999999999);

	return '<script id="' + scriptId + '" type="application/javascript">var ' +
			CLIENT_VAR + '=' + JSON.stringify(props) + ';' +
			'(function(){' +
			'var theScript = document.getElementById("' + scriptId + '");' +
			'theScript.parentNode.removeChild(theScript);' +
			'})();</script>';
}
