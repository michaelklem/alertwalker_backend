const BCrypt 		= require('bcryptjs');
const Environment 		= require('../environment');
const Ext 			= require('../extension');
const { ModelManager, NotificationManager, OauthManager, UserManager, UtilityManager } = require('../manager');
const {Log}		= require('../model');
const Router 		= require('express').Router();
const BodyParser	= require('body-parser');
const Request = require('request');

Router.use(BodyParser.urlencoded({ extended: true }));
Router.use(BodyParser.json());

/**
	API routes providing oauth related functionality such as third party login and handling oauth requests from third party services
  @module oauth/
 */

/**
	@name Login
	@route {POST}	/login
	@description Log a user into the system using a third party account.
	Will also create an account in the system if one doesn't exist
	@headerparam	{String}	x-request-source 	(web|mobile)
	@headerparam 	{GUID}	x-device-id 	Unique ID of device calling API
	@headerparam 	{String}	x-device-service-name 	(ios|android|chrome|safari)
	@bodyparam 	{String} 	username  Username
  @bodyparam 	{String} 	email  		email address
  @bodyparam 	{String}	password 	unhashed password
 	@bodyparam 	{String} 	phone  		Phone number
 */
Router.post('/login', async (req, res) =>
{
	console.log('[oauth-controller.handler] login called');

	try
	{
		// Validate headers
		const headerValidation = await Ext.validateHeaders(req.headers, {bypassToken: true});
		if(headerValidation.error !== null)
		{
			return res.status(200).send({ error: headerValidation.error });
		}

		console.log('[oauth-controller.handler] login req.body: ' + JSON.stringify(req.body) );

    if(!req.body.email && req.body.source !== 'apple')
    {
			console.log('Email param error');
      return res.status(200).send({ error: "Missing email parameter" });
    }
    if(!req.body.externalId && !req.body.password)
    {
      return res.status(200).send({ error: "Missing external ID parameter" });
    }
    if(!req.body.source && !req.body.password)
    {
      return res.status(200).send({ error: "Missing source parameter" });
    }
		if(!req.body.firstName && !req.body.password)
		{
			return res.status(200).send({ error: "Missing first name parameter" });
		}
		if(!req.body.lastName && !req.body.password)
		{
			return res.status(200).send({ error: "Missing last name parameter" });
		}
		if((!req.body.photo && req.body.photo !== '') && !req.body.password)
		{
			return res.status(200).send({ error: "Missing photo parameter" });
		}
		if((!req.body.url && req.body.source !== 'apple' && req.body.source !== 'google') && !req.body.password)
		{
			return res.status(200).send({ error: "Missing url parameter" });
		}

		let email = req.body.email;

		const modelMgr = ModelManager.GetInstance();
		const mUser = modelMgr.getModel('user');
    const mThirdPartyAccount = modelMgr.getModel('thirdpartyaccount');

    // If third party account or existing user with this email or password supplied
		// log user in
    let thirdPartyAccountParams = { source: req.body.source, externalId: req.body.externalId };
    let thirdPartyAccount = await mThirdPartyAccount.findOne(thirdPartyAccountParams);
		let user = await mUser.findOne({ email: email.toLowerCase() });
    if(thirdPartyAccount || req.body.password || user)
    {
			const result = await UserManager.GetInstance().login({
				email: email,
				source: req.body.source,
				accessToken: req.body.accessToken,
				firstName: req.body.firstName,
				lastName: req.body.lastName,
				photo: req.body.photo,
				url: req.body.url,
				externalId: req.body.externalId,
				deviceId: req.headers['x-device-id'],
				requestSource: req.headers['x-request-source'],
				deviceServiceName: req.headers['x-device-service-name'],
				password: req.body.password,
				thirdPartyAccount: thirdPartyAccount,
			});
			if(result.error !== null)
			{
				return res.status(200).send({ error: result.error });
			}

      // Success
  		await Log.Info(__filename, "User " + user._id + " successfully signed in.");
			res.status(200).send(
  		{
  			error: null,
  			smsVerificationRequired: result.smsVerificationRequired,
  			tosRequired: result.tosRequired,
  			token: result.tokenResult.token,
  			user: result.user,
				oauthTokens: result.oauthTokens,
				receipt: result.receipt,
				thirdPartyAccounts: result.thirdPartyAccounts,
				inviteCodeRequired: result.inviteCodeRequired,
  		});
    }

    // Register user
    else
    {
      const result = await UserManager.GetInstance().register({
				email: email,
				source: req.body.source,
				accessToken: req.body.accessToken,
				firstName: req.body.firstName,
				lastName: req.body.lastName,
				photo: req.body.photo,
				url: req.body.url,
				externalId: req.body.externalId,
				deviceId: req.headers['x-device-id'],
				requestSource: req.headers['x-request-source'],
				deviceServiceName: req.headers['x-device-service-name'],
			});
			if(result.error !== null)
			{
				return res.status(200).send({ error: result.error });
			}

  		// Success
  		res.status(200).send(
  		{
  			error: null,
  			smsVerificationRequired: result.smsVerificationRequired,
  			tosRequired: result.tosRequired,
  			token: result.tokenResult.token,
  			user: result.user,
				oauthTokens: result.oauthTokens,
				receipt: result.receipt,
				thirdPartyAccounts: result.thirdPartyAccounts,
				inviteCodeRequired: result.inviteCodeRequired,
  		});
    }
	}
	catch(err)
	{
		console.log(err.message + '\nStack trace: ' + err.stack);
		if(err.message.indexOf('E11000') === -1)
		{
			await Log.Error(__filename, err);
			res.status(200).send({ error: err.message });
		}
		// Duplicate username/email
		else
		{
			await Log.Error(__filename, "This email/username is already taken.");
			res.status(200).send({ error: "This email/username is already taken." });
		}
	}
});


Router.post('/settings', async (req, res) =>
{
	try
	{
		console.log(req.body);
	}
	catch(err)
	{
		console.log(err.message + '\nStack trace: ' + err.stack);
		await Log.Error(__filename, err);
		res.status(200).send({ error: err.message });
	}
});

/**
	@name Authentication URL
	@route {POST}	/auth-url
	@description Retrieve URL to authenticate via OAuth2 with external provider
	@authentication Requires a valid x-access-token
	@headerparam 	{JWT} 	x-access-token		Token to decrypt
	@headerparam	{String}	x-request-source 	(web|mobile)
	@headerparam 	{GUID}	x-device-id 	Unique ID of device calling API
	@headerparam 	{String}	x-device-service-name 	(ios|android|chrome|safari)
	@bodyparam 	{String}	source 	Google|Microsoft|Apple
  */
Router.post('/auth-url', async (req, res) =>
{
	try
	{
		// Validate headers
 		const headerValidation = await Ext.validateHeaders(req.headers);
 		if(headerValidation.error !== null)
 		{
 			return res.status(200).send({ error: headerValidation.error });
 		}

		if(!req.body.source)
		{
			return res.status(200).send({ error: 'Missing source parameter' });
		}

 		// Decode token to user ID and locate user
 		const decodedTokenResult = await Ext.validateToken(req.headers['x-access-token']);

		let userId = '';

		// Guest login
		if(decodedTokenResult.error !== null)
 		{
			userId = req.headers['x-device-service-name'] + ':' + req.headers['x-device-id'];
		}
		else
		{
			userId = decodedTokenResult.user._id.toString();
		}

		let url = '';
		if(req.body.source === 'google')
		{
			url = await OauthManager.GetInstance().googleAuthUrl(userId);
		}
		else if(req.body.source === 'microsoft')
		{
			url = await OauthManager.GetInstance().microsoftAuthUrl(userId);
		}

		console.log('[oauth-controller.auth-url] url: ' + url);

		res.status(200).send({
			error: null,
			token: decodedTokenResult.token,
			result: url
		});
	}
	catch(err)
	{
		console.log(err.message + '\nStack trace: ' + err.stack);
		await Log.Error(__filename, err);
		res.status(200).send({ error: err.message });
	}
});

/**
	@name handler
	@function
	@inner
  @description Handles response redirection from OAuth
	@param 	{JWT} 	"headers[x-access-token]"		Token to decrypt
	@ignore
  */
Router.get('/handler', async (req, res) =>
{
	console.log('[oauth-controller.handler] req.query: ' + JSON.stringify(req.query));

	const modelMgr = ModelManager.GetInstance();
	const mConfiguration = modelMgr.getModel('configuration');

	let mobileUrl = await mConfiguration.findOne({ name: 'MOBILE_URL '});
	mobileUrl = mobileUrl.value;

	let redirectUrl = mobileUrl + 'api?source=';
	if(req.query.state && req.query.state.indexOf('microsoft') !== -1)
	{
		redirectUrl += 'microsoft&code=' + req.query.code;
	}
	else
	{
		redirectUrl += 'google&code=' + req.query.code;
	}

	console.log('[oauth-controller.handler] redirectUrl: ' + redirectUrl);
	console.log(redirectUrl);
	res.redirect(301, redirectUrl);
});

/**
	@name convert
	@function
	@inner
  @description Convert code from oauth to token
	@param 	{JWT} 	"headers[x-access-token]"		Token to decrypt
	@ignore
  */
Router.post('/convert', async (req, res) =>
{
	console.log('[oauth-controller] convert called ')
	try
	{
		// Validate headers
 		const headerValidation = await Ext.validateHeaders(req.headers);
 		if(headerValidation.error !== null)
 		{
 			return res.status(200).send({ error: headerValidation.error });
 		}

		if(!req.body.code)
		{
			return res.status(200).send({ error: "Missing code parameter" });
		}
		if(!req.body.source)
		{
			return res.status(200).send({ error: "Missing source parameter" });
		}

 		// Decode token to user ID and locate user
 		const decodedTokenResult = await Ext.validateToken(req.headers['x-access-token']);
 		if(decodedTokenResult.error !== null)
 		{
 			// Guest is registering
			userId = req.headers['x-device-service-name'] + ':' + req.headers['x-device-id'];
			let token = null;
			if(req.body.source === 'google')
			{
				token = await OauthManager.GetInstance().googleToken(userId, req.body.code);
				return res.status(200).send(
				{
					error: null,
					results:
					{
						accessToken: token.token,
						externalId: token.userInfo.data.id,
						email: token.userInfo.data.email,
						source: 'google',
						firstName: 'Google',
						lastName: 'User',
						photo: '',
						url: '',
					}
				});
			}
			else
			{
				return res.status(200).send({ error: decodedTokenResult.error });
			}
 		}
		else
		{
			// Existing user is adding a third party service
			let token = null;
			if(req.body.source === 'google')
			{
				token = await OauthManager.GetInstance().googleToken(decodedTokenResult.user._id.toString(), req.body.code);
				token = token.token;
			}
			else if(req.body.source === 'microsoft')
			{
				// For some reason I'm getting a # at the end of my code when I send it over to us
				let code = req.body.code;
				if(code.charAt(code.length - 1) === '#')
				{
					code = code.substr(0, code.length - 1);
				}
				token = await OauthManager.GetInstance().microsoftToken(decodedTokenResult.user._id.toString(), code);
			}

			const modelMgr = ModelManager.GetInstance();
			const mOauthToken = modelMgr.getModel('oauthtoken');

			const oAuthToken = await mOauthToken.create({ token: token, source: req.body.source }, decodedTokenResult.user);

			res.status(200).send({
				error: null,
				token: decodedTokenResult.token,
				result: oAuthToken
			});
		}
	}
	catch(err)
	{
		console.log(err);
		//console.log(err.message + '\nStack trace: ' + err.stack);
		await Log.Error(__filename, err);
		res.status(200).send({ error: err.message });
	}
});


/**
	@name Remove Token
	@route {POST}	/remove-token
	@description Remove oauth token
	@authentication Requires a valid x-access-token
	@headerparam 	{JWT} 	x-access-token		Token to decrypt
	@headerparam	{String}	x-request-source 	(web|mobile)
	@headerparam 	{GUID}	x-device-id 	Unique ID of device calling API
	@headerparam 	{String}	x-device-service-name 	(ios|android|chrome|safari)
	@bodyparam 	{String}	source 	Where the token is from (google|microsoft|instagram)
  */
Router.post('/remove-token', async (req, res) =>
{
	console.log('[oauth-controller.remove-token] called');

	try
	{
		// Validate headers
 		const headerValidation = await Ext.validateHeaders(req.headers);
 		if(headerValidation.error !== null)
 		{
 			return res.status(200).send({ error: headerValidation.error });
 		}

 		// Decode token to user ID and locate user
 		const decodedTokenResult = await Ext.validateToken(req.headers['x-access-token']);
 		if(decodedTokenResult.error !== null)
 		{
 			return res.status(200).send({ error: decodedTokenResult.error });
 		}

		if(!req.body.source)
		{
			return res.status(200).send({ error: "Missing source parameter" });
		}

		const modelMgr = ModelManager.GetInstance();
		const mOauthToken = modelMgr.getModel('oauthtoken');
		const mThirdPartyAccount = modelMgr.getModel('thirdpartyaccount');

		const oAuthToken = await mOauthToken.delete({ createdBy:  decodedTokenResult.user._id, source: req.body.source });
		const thirdPartyAccount = await mThirdPartyAccount.delete({ createdBy:  decodedTokenResult.user._id, source: req.body.source });

		console.log('[oauth-controller.remove-token] completed');

		res.status(200).send({
			error: null,
			token: decodedTokenResult.token,
			result: true
		});
	}
	catch(err)
	{
		console.log(err.message + '\nStack trace: ' + err.stack);
		await Log.Error(__filename, err);
		res.status(200).send({ error: err.message });
	}
});


/**
	@name Save Token
	@route {POST}	/save-token
	@description Save oauth token
	@authentication Requires a valid x-access-token
	@headerparam 	{JWT} 	x-access-token		Token to decrypt
	@headerparam	{String}	x-request-source 	(web|mobile)
	@headerparam 	{GUID}	x-device-id 	Unique ID of device calling API
	@headerparam 	{String}	x-device-service-name 	(ios|android|chrome|safari)
	@bodyparam 	{String}	accessToken 	The oauth token
	@bodyparam 	{String}	externalId 	The unique ID for this user in third party system
	@bodyparam 	{String}	source 	Where this token is from
  */
Router.post('/save-token', async (req, res) =>
{
	try
	{
		// Validate headers
 		const headerValidation = await Ext.validateHeaders(req.headers);
 		if(headerValidation.error !== null)
 		{
 			return res.status(200).send({ error: headerValidation.error });
 		}

 		// Decode token to user ID and locate user
 		const decodedTokenResult = await Ext.validateToken(req.headers['x-access-token']);
 		if(decodedTokenResult.error !== null)
 		{
 			return res.status(200).send({ error: decodedTokenResult.error });
 		}

		if(!req.body.accessToken)
		{
			return res.status(200).send({ error: "Missing accessToken parameter" });
		}
		if(!req.body.externalId)
		{
			return res.status(200).send({ error: "Missing externalId parameter" });
		}
		if(!req.body.source)
		{
			return res.status(200).send({ error: "Missing source parameter" });
		}
		/*if(!req.body.url)
		{
			return res.status(200).send({ error: "Missing url parameter" });
		}*/

		const modelMgr = ModelManager.GetInstance();
		const mOauthToken = modelMgr.getModel('oauthtoken');
		const mThirdPartyAccount = modelMgr.getModel('thirdpartyaccount');

		const oAuthToken = await mOauthToken.create({ token: req.body.accessToken, source: req.body.source }, decodedTokenResult.user);

		// Create third party account
		const thirdPartyAccountParams = { source: req.body.source, externalId: req.body.externalId, url: req.body.url ? req.body.url : 'https://facebook.com' };
		const thirdPartyAccount = await mThirdPartyAccount.create(thirdPartyAccountParams, decodedTokenResult.user);
		if(!thirdPartyAccount)
		{
			await Log.Error(__filename, '{ERR_1}-Unknown error during external account linking');
			return res.status(200).send({ error: 'Unknown error' });
		}

		res.status(200).send({
			error: null,
			token: decodedTokenResult.token,
			result: oAuthToken
		});
	}
	catch(err)
	{
		console.log(err.message + '\nStack trace: ' + err.stack);
		await Log.Error(__filename, err);
		res.status(200).send({ error: err.message });
	}
});

/**
	@name Third Party Account
	@route {POST}	/third-party-account
	@description Retrieve third party account for user
	@authentication Requires a valid x-access-token
	@headerparam 	{JWT} 	x-access-token		Token to decrypt
	@headerparam	{String}	x-request-source 	(web|mobile)
	@headerparam 	{GUID}	x-device-id 	Unique ID of device calling API
	@headerparam 	{String}	x-device-service-name 	(ios|android|chrome|safari)
	@bodyparam 	{String}	source 	Where this token is from
  */
Router.post('/third-party-account', async (req, res) =>
{
	console.log('[oauth-controller] third-party-account called ')

	try
	{
		// Validate headers
 		const headerValidation = await Ext.validateHeaders(req.headers);
 		if(headerValidation.error !== null)
 		{
 			return res.status(200).send({ error: headerValidation.error });
 		}

 		// Decode token to user ID and locate user
 		const decodedTokenResult = await Ext.validateToken(req.headers['x-access-token']);
 		if(decodedTokenResult.error !== null)
 		{
 			return res.status(200).send({ error: decodedTokenResult.error });
 		}

		if(!req.body.source)
		{
			return res.status(200).send({ error: "Missing source parameter" });
		}

		const modelMgr = ModelManager.GetInstance();
		const mThirdPartyAccount = modelMgr.getModel('thirdpartyaccount');

		const thirdPartyAccount = await mThirdPartyAccount.findOne({ createdBy: decodedTokenResult.user._id, source: req.body.source });
		res.status(200).send({
			error: null,
			token: decodedTokenResult.token,
			result: thirdPartyAccount
		});
	}
	catch(err)
	{
		console.log(err.message + '\nStack trace: ' + err.stack);
		await Log.Error(__filename, err);
		res.status(200).send({ error: err.message });
	}
});

function doRequest(options)
{
  return new Promise(function (resolve, reject)
	{
    Request(options, function (error, res, body)
		{
      if (!error && res.statusCode == 200)
			{
        resolve(body);
      }
			else
			{
        reject(error);
      }
    });
  });
}

module.exports = Router;
