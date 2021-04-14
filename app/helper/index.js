const DatabaseManager = require('../manager/databaseManager');

// Workaround to allow us to interact with configuration model inside the core model class
async function getValueForConfig(name)
{
	const config = await DatabaseManager.GetInstance().find('configuration', {name: name});
	return config;
}


module.exports =
{
	getValueForConfig: getValueForConfig
};
