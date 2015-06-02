var React = require('react'),
	_ = require('lodash'),
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

		try {
			// grab our cached element factory (or create a new one)
			var factory = factoryCache[filename];
			if (!factory) {
				var view = require(filename);
				factory = factoryCache[filename] = React.createFactory(view);
			}

			var props = _.merge({}, _.omit(options, ['settings', '_locals', 'cache']));

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
