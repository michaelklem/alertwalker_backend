const Util   	= require('util');
const Winston 	= require('winston');
const JWT 			= require('jsonwebtoken');
const Environment 		= require('../environment');
const ModelManager = require('../manager/modelManager');
const ShortId = require('./shortId');
const Log 			= require('../model').Log;
const Logger 	= Winston.createLogger(
{
	transports: [new Winston.transports.Console()]
});

/**
  * Write message to console
  *
  * @param 	{String} 	message  	to be written to console
  * @param 	{String}	level 		log level (info, debug, verbose, warn, error) 	Default 'info'
  *
  * @return  {Null} nothing
  */
function print(message, level = 'info')
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
		return null;
	}
	catch(err)
	{
		Logger.log('error', 'Ext.print()\n' + err + '\n' + err.stack);
		return null;
	}
}

/**
  Generate random integer value
  @param 	{Int} 	min  	Minimum range
  @param 	{Int}	max 	Maximum range
  @returns {Int}	Random integer
  */
function randomIntFromInterval(min, max)
{
    return Math.floor(Math.random() * (max - min + 1) + min).toString();
}

/**
	Validate token and keep alive if required
	@param	{JWT}	token		JWT token of user
	@param 	{Array.<String>?}	requiredAuth	Optional Array of authorization types this requester must be
	@returns {JSON} token: jwt_token, user: user, error: error message or null if none
*/
async function validateToken(token, requiredAuth)
{
	try
	{
		const modelMgr = ModelManager.GetInstance();

		// Guest user
		if(token === 'guest' || !token)
		{
			const mConfiguration = modelMgr.getModel('configuration');
			let guestAccessAllowed = false;
			if(guestAccessAllowed !== 'true')
			{
				// Not live, send back mroe info
				if(Environment.LIVE !== 'true')
				{
					console.log('Token: ' + token);
					return {error: 'Please login. Received x-access-token: ' + token};
				}
				return {error: 'Please login.'};
			}

			let guestAuthType = 'customer';
			return {error: null, token: token, user: { authorization: { type: guestAuthType }, _id: 'guest' } };
		}

		// Validate user
		const decoded = JWT.verify(token.toString(), Environment.JWT_TOKEN_KEY);
		const mUser = modelMgr.getModel('user');
		const mConfiguration = modelMgr.getModel('configuration');
		const user = await mUser.forId(decoded.id);
		delete user.password;

		// Bad id
		if(user === undefined || user === null)
		{
			console.log("Could not find user with params: { _id: " + decoded.id  + '}');
			await Log.Error(__filename, '{ERR_2}-Bad validation attempt with valid x-access-token and invalid decoded ID');
			return {error: 'Please contact support.'};
		}

		if(requiredAuth)
		{
			if(requiredAuth.indexOf(user.authorization.type) === -1)
			{
				return {error: 'Unauthorized access'};
			}
		}

		return {error: null, token: token, user: user};
	}
	catch(err)
	{
		// Refresh token
		if(err.name === 'TokenExpiredError')
		{
			console.log("Ext.validateToken - Expired token used {" + token + "}");
			try
			{
				const modelMgr = ModelManager.GetInstance();
				const mToken = modelMgr.getModel('token');
				if(!mToken)
				{
					return {error: Environment.ERROR_MESSAGE, token: null, user: null};
				}
				const oldToken = await mToken.findOne({ jwt: token });
				if(!oldToken)
				{
					await Log.Error(__filename, '{ERR_5}-Bad validation attempt with invalid x-access-token: ' + token);
					return {error: 'Invalid session. Please login again.', token: null, user: null};
				}

				const mUser = modelMgr.getModel('user');
				const user = await mUser.forId(oldToken.userId);
				// TODO: Remove user password

				// Bad id
				if(user === undefined || user === null)
				{
					console.log("Could not find user with old token: { jwt: " + token  + ', userId: ' + oldToken.userId + '}');
					await Log.Error(__filename, '{ERR_2}-Bad validation attempt with expired x-access-token and invalid x-access-id');
					return {error: 'Invalid session. Please login again.', token: null, user: null};
				}

				const newToken = JWT.sign({ id: user._id }, Environment.JWT_TOKEN_KEY,
				{
					expiresIn: Environment.JWT_TOKEN_EXPIRE_SEC
				});

				// Save new token
				await mToken.create({ deviceId: oldToken.deviceId, jwt: newToken, userId: oldToken.userId });

				return {error: null, token: newToken, user: user};
			}
			catch(err2)
			{
				await Log.Error(__filename, '{ERR_4}\nError:\n' + err2.message + '\nStack trace:\n' + err2.stack);
				return {error: 'Invalid session. Please login again.', token: null, user: null};
			}
		}
		Log.Error(__filename, '{ERR_6} (' + token + ') - Error:' + err.message + '\nStack trace:\n' + err.stack);
		return {error: 'Invalid session. Please login again.', token: null, user: null};
	}
}


/**
	Create new token
	@param	{String}	userId		UserId this token is for
	@param 	{String}	deviceId 	Id of device user is on (Session ID for browser based)
	@return {JSON} token: jwt_token, error: error message or null if none
*/
async function createTokenForUser(userId, deviceId)
{
	//console.log('Creating token for user:' + userId);
	try
	{
		const jwtToken = JWT.sign({ id: userId }, Environment.JWT_TOKEN_KEY,
		{
			expiresIn: Environment.JWT_TOKEN_EXPIRE_SEC
		});

		/* Save token in table because if the user tries
		 	an expired token we can look it up here
		 and let them carry on with a new token */
		const modelMgr = ModelManager.GetInstance();
		const mToken = modelMgr.getModel('token');
		await mToken.create({ deviceId: deviceId, jwt: jwtToken, userId: userId });

		return {error: null, token: jwtToken};
	}
	catch(err)
	{
		await Log.Error(__filename, '{ERR_3}-Failed to create token record for user ID: ' + userId + '\nError:\n' + err.message + '\nStack trace:\n' + err.stack);
		return { error: 'Could not create token. Please contact support.', token: null};
	}
}

/**
	Validate required headers
	@param	{Object}	headers		HTTP request  headers
	@param 	{Object} 	params 	{bypassToken: Bool}
	@returns {JSON} error: error message or null if none
*/
async function validateHeaders(headers, params = {bypassToken: false})
{
	try
	{
		if(!headers['x-request-source'])
		{
			return { error: 'Missing source parameter' };
		}
		if(!headers['x-access-token'] && !params.bypassToken)
		{
			return { error: 'No token provided.' };
		}
		if(!headers['x-device-id'])
		{
			return { error: 'No device ID provided.' };
		}
		if(!headers['x-device-service-name'])
		{
			return { error: 'No device service name provided.' };
		}

		return {error: null};
	}
	catch(err)
	{
		await Log.Error(__filename, '{ERR_7}\nError:\n' + err.message + '\nStack trace:\n' + err.stack);
		return {error: 'Please contact support'};
	}
}
module.exports =
{
	createTokenForUser: createTokenForUser,
	print: 					print,
	randomIntFromInterval:	randomIntFromInterval,
	shortId:				ShortId,
	validateHeaders: validateHeaders,
	validateToken: 		validateToken
};
