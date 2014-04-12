var config = require('../lib/config');

var should = require('should'),
	models = require('ng-models')

if (!process.env.NG_TEST) {
	console.log("\nNot in TEST environment. Please export NG_TEST variable\n");
}

it('confirms we are in NG_TEST', function(done) {
	should(process.env.NG_TEST).be.ok;

	done();
})