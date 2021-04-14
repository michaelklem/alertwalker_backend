const Path 		= require('path');
const Mongo 	= require('mongoose');
const Util   	= require('util');
const Winston 	= require('winston');
const Logger 	= Winston.createLogger(
{
	transports: [new Winston.transports.Console()]
});


// Schema
const schema =  new Mongo.Schema(
{
	data: { required: true, type: Object },
	type: { required: true, type: String }
}, { timestamps: { createdAt: 'createdOn', updatedAt: 'updatedOn' } });

// Model
const Model = Mongo.model("Log", schema);


/**
  Represent logs which could have info/error/debug level
*/
class Log
{
	// MARK: - Getters / Data fields
	static get Type()
	{
		const type =
		{
			Debug: 	"debug",
			Error: 	"error",
			Info: 	"info"
		};

		return type;
	}

	/**
	 	Return name of file where executing thread is without .js
	 	@param 	{String} 	fileName 	Path of caller
	 	@return  {String} 	Name of file where executing thread is without .js
	 */
	static GetCaller(fileName)
	{
		const path = Path.basename(fileName);
		return path.substring(0, path.indexOf('.js'));
	}


	// MARK: - Create logs
	/**
	 	Create a log object in the database and option to print to console
	 	@param 	{String} 	caller 			Path of caller
	 	@param 	{Object}	data 		Rest of the arguements
	 	@param 	{Bool}		printToConsole	Output to console
	 	@return  {Object} 	Log object created in database
	 */
	static Info(caller, data, printToConsole = true)
	{
		if(printToConsole)
		{
			Log.Print(caller + ": " + data);
		}
		return Model.create({  data: { Caller: Log.GetCaller(caller), Data: data }, type: Log.Type.Info });
	}

	/**
		Create a log object in the database and option to print to console
		@param 	{String} 	caller 			Path of caller
		@param 	{Object}	data 		Rest of the arguements
		@param 	{Bool}		printToConsole	Output to console
		@return  {Object} 	Log object created in database
	 */
	static Error(caller, data, printToConsole = true)
	{
		if(printToConsole)
		{
			// Log stack trace if available
			if(data.stack !== null && data.stack !== 'undefined')
			{
				Log.Print(caller + ": " + data + "\nStack trace: \n" + data.stack, 'error');
			}
			else
			{
				Log.Print(caller + ": " + data, 'error');
			}
		}
		return Model.create({ data: { "Caller": Log.GetCaller(caller), "Data": data }, type: Log.Type.Error });
	}

	/**
	 	Create a log object in the database and option to print to console
	 	@param 	{String} 	caller 			Path of caller
	 	@param 	{Object}	data 		Rest of the arguements
	 	@param 	{Bool}		printToConsole	Output to console
	 	@return  {Object} 	Log object created in database
	 */
	static Debug(caller, data, printToConsole = true)
	{
		if(printToConsole)
		{
			Log.Print(caller + ": " + data, 'debug');
		}
		return Model.create({ data: { "Caller": Log.GetCaller(caller), "Data": data }, type: Log.Type.Debug });
	}


	/**
	 	Write message to console
	 	@note Had to put it here instead of using Ext.print because of circular depedency **
	 	@param 	{String} 	message  	to be written to console
	 	@param 	{String}	level 		log level (info, debug, verbose, warn, error) 	Default 'info'
	 	@returns  {Nothing} Nothing
	 */
	static Print(message, level = 'info')
	{
		try
		{
			// Object
			if(typeof message === 'object' && message !== null)
			{
				Logger.log(level, Util.inspect(message, false, null));
			}

			// Primitive
			else
			{
				Logger.log(level, message);
			}
		}
		catch(err)
		{
			Logger.log('error', 'Ext.print()\n' + err + '\n' + err.stack);
		}
	}
}


module.exports = Log;
