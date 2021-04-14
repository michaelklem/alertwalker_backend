const BCrypt 		= require('bcryptjs');
const Environment 		= require('../environment');
const Ext 			= require('../extension');
const {ModelManager, NotificationManager, OauthManager, SiteManager, UtilityManager} = require('../manager');
const Multiparty    = require('multiparty');
const {Log}		= require('../model');
const Helper = require('../helper');
const Router 		= require('express').Router();
const BodyParser	= require('body-parser');
Router.use(BodyParser.urlencoded({ extended: true, limit: '50mb' }));
Router.use(BodyParser.json({ limit: '50mb' }));

/**
	API routes providing user related functionality such as authentication and password reset
  @module users/
 */


/**
	@name Me
	@route {POST}	/me
	@description Retrieve settings for a user
	@authentication Requires a valid x-access-token
	@headerparam 	{JWT} 	x-access-token		Token to decrypt
	@headerparam	{String}	x-request-source 	(web|mobile)
	@headerparam 	{GUID}	x-device-id 	Unique ID of device calling API
	@headerparam 	{String}	x-device-service-name 	(ios|android|chrome|safari)
	@returns {MongoDocument.<User>}
 */
Router.post('/me', async (req, res) =>
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

		const modelMgr = ModelManager.GetInstance();

		// If ID specified lookup user otherwise use user calling
		let user = null;
		if(req.body.id)
		{
			const mUser = modelMgr.getModel('user');
			user = await mUser.findOne({ _id: req.body.id });
			user = JSON.parse(JSON.stringify(user));
		}
		else
		{
			user = JSON.parse(JSON.stringify(decodedTokenResult.user));
		}

		delete user.password;

    // Get OAuth tokens
  	const oauthTokens = await OauthManager.GetInstance().getTokensForUser(decodedTokenResult.user._id);

		// Success
		res.status(200).send({
			error: null,
			token: decodedTokenResult.token,
			results: user,
			customDetails: oauthTokens
		});
	}
	catch(err)
	{
		console.log(err);
		res.status(200).send({ error: 'Failed to authenticate token.' });
	}
});

/**90
	@name Update
	@route {POST}	/update
	@description Update user settings
	@authentication Requires a valid x-access-token
	@headerparam 	{JWT} 	x-access-token		Token to decrypt
	@headerparam	{String}	x-request-source 	(web|mobile)
	@headerparam 	{GUID}	x-device-id 	Unique ID of device calling API
	@headerparam 	{String}	x-device-service-name 	(ios|android|chrome|safari)
	@bodyparam 	{Object}	Must match what is defined to be allowed for the settings page
	@return {MongoDocument.<User>} Updated user
 */
Router.post('/update', async (req, res) =>
{
	try
	{
		// Validate headers
		const headerValidation = await Ext.validateHeaders(req.headers);
		if(headerValidation.error !== null)
		{
			return res.status(200).send({ error: headerValidation.error });
		}

		// Decode token to user
		const decodedTokenResult = await Ext.validateToken(req.headers['x-access-token']);
		if(decodedTokenResult.error !== null)
		{
			return res.status(200).send({ error: decodedTokenResult.error });
		}

		// Validate schema fields and extract values
		const siteMgr = SiteManager.GetInstance();
		let conversionResult = await siteMgr.requestFieldsToPageValues(req.headers, 'settings', req.body);
		if(conversionResult.error !== null)
		{
			return res.status(200).send({ error: conversionResult.error });
		}

		// Update user
		const modelMgr = ModelManager.GetInstance();
		const mUser = modelMgr.getModel('user');
		const user = await mUser.updateById(decodedTokenResult.user._id, conversionResult.pageValues);

		// Error
		if(user === null || user === undefined)
		{
			await Log.Error(__filename, "Invalid login attempt for email: " + req.body.username);
			return res.status(200).send({ error: "Could not find a matching user with that email and password" });
		}

		// Success
		res.status(200).send({
			error: null,
			token: decodedTokenResult.token,
			results: user
		});
	}
	catch(err)
	{
		console.log(err);
		res.status(200).send({ error: 'Failed to authenticate token.' });
	}
});


/**
	@name upload
	@function
	@inner
 	@description Upload a file for a user
 	@param 	{JWT} 	"headers[x-access-token]""		Token to decrypt
	@param 	{File}	fileData 	File data to upload
 	@return {URI} URL where file is uploaded
	@ignore
 */
Router.post('/upload', async (req, res) =>
{
	try
	{
		const form = new Multiparty.Form();
		form.maxFieldsSize = 10*1024*1024;
		form.maxFilesSize= 10*1024*1024;
		form.parse(req, async (formErr, fields, files) =>
		{
			if(formErr)
			{
				console.log(formErr);
				return res.status(200).send({ error: formErr });
			}

			// Required on every call
			if(!files)
			{
				return res.status(200).send({ error: 'Missing ID parameter' });
			}
			if(!req.headers['x-access-token'])
			{
				return res.status(200).send({ error: 'No token provided.' });
			}
			if(!req.headers['x-request-source'])
			{
				return res.status(200).send({ error: 'Missing source' });
			}

			// Validate user
			const decodedTokenResult = await Ext.validateToken(req.headers['x-access-token']);
			if(decodedTokenResult.error !== null)
			{
				return res.status(200).send(decodedTokenResult.error);
			}

			// Build update params
			const modelMgr = ModelManager.GetInstance();
			const mUser = modelMgr.getModel('user');
			const coreUserDoc = await mUser.getCoreDocument();
			const updateParams = await modelMgr.convertFormFieldsToJsonParams(coreUserDoc.schemaFields, fields, files, decodedTokenResult.user._id);
			const updatedRecord = await mUser.updateById(decodedTokenResult.user._id, updateParams);

			// Error
			if(updatedRecord === null || updatedRecord === undefined)
			{
				await Log.Error(__filename, "Invalid login attempt for user: " + decodedTokenResult.user._id);
				return res.status(200).send({ error: Environment.ERROR_MESSAGE });
			}

			// Success
			return res.status(200).send({
				error: null,
				token: decodedTokenResult.token,
				results: updatedRecord
			});
		});
	}
	catch(err)
	{
		console.log(err);
		res.status(200).send({ error: 'Failed to authenticate token.' });
	}
});


/**
	@name login
	@function
	@inner
 	@description Log a user in
 	@param 	{string}	username		user's username
 	@param 	{string}	password 	user's password (hashed)
	@param 	{GUID}		"headers[x-device-id]"	Unique representation of users device
	@ignore
 */
Router.post('/login', async (req, res) =>
{
	try
	{
		// Validate headers
		const headerValidation = await Ext.validateHeaders(req.headers, {bypassToken: true});
		if(headerValidation.error !== null)
		{
			return res.status(200).send({ error: headerValidation.error });
		}

		const modelMgr = ModelManager.GetInstance();
		const mUser = modelMgr.getModel('user');
		const mVerification = modelMgr.getModel('verification');
		const mConfiguration = modelMgr.getModel('configuration');
		const mInviteCode = modelMgr.getModel('invitecode');

		// Validate schema fields and extract values
		const siteMgr = SiteManager.GetInstance();
		let conversionResult = await siteMgr.requestFieldsToPageValues(req.headers, 'login', req.body);
		if(conversionResult.error !== null)
		{
			return res.status(200).send({ error: conversionResult.error });
		}

		// Build params to filter on when searching for user
		const userParams = {};
		const pageValueKeys = Object.keys(conversionResult.pageValues);
		for(let i = 0; i < pageValueKeys.length; i++)
		{
			if(pageValueKeys[i] === 'email')
			{
				userParams[pageValueKeys[i]] = conversionResult.pageValues[pageValueKeys[i]].toLowerCase();
			}
			if(pageValueKeys[i] !== 'password')
			{
				userParams[pageValueKeys[i]] = conversionResult.pageValues[pageValueKeys[i]];
			}
		}

		let user =  await mUser.findOne(userParams, modelMgr.getUserSelectFields());
		if(user === null || user === undefined)
		{
			await Log.Error(__filename, "Invalid login attempt for " + JSON.stringify(req.body));
			return res.status(200).send({ error: "Could not find a matching user with that information" });
		}
    user = JSON.parse(JSON.stringify(user));

		// Check password
		console.log(conversionResult.pageValues);
		console.log(user);
		const result = await BCrypt.compare(conversionResult.pageValues.password.unhashed, user.password);
		if(!result)
		{
			await Log.Error(__filename, "Invalid login attempt for " + JSON.stringify(conversionResult.pageValues));
			return res.status(200).send({ error: "Could not find a matching user with that information" });
		}
		// Remove password from output
		delete user.password;

    //console.log(user);

		// API token
		const tokenResult = await Ext.createTokenForUser(user._id, req.headers['x-device-id']);
		if(tokenResult.error !== null)
		{
			return res.status(200).send({ error: tokenResult.error });
		}

		/*
			If mobile query pushtoken to see if any matching device-id but no user field
			then update with user ID
		*/
		if(req.headers['x-request-source'] === 'mobile')
		{
			const pushToken = await UtilityManager.GetInstance().get('pusher').FixOrphanToken(	user._id,
																																												 	req.headers['x-device-service-name'],
																																											 	 	req.headers['x-device-id']);
		}

		// Success
		await Log.Info(__filename, "User " + user._id + " successfully signed in.");
		res.status(200).send(
		{
			error: null,
			token: tokenResult.token,
			user: user,
		});
	}
	catch(err)
	{
		await Log.Error(__filename, err);
		res.status(500).send({ error: err });
	}
});



/**
	@name get-home-page
	@function
	@inner
  @description Retrieve home page data for user
	@param 	{JWT} 	"headers[x-access-token]"		Token to decrypt
	@ignore
  */
Router.post('/get-home-page', async (req, res) =>
{
	try
	{
		// Validate headers
		const headerValidation = await Ext.validateHeaders(req.headers);
		if(headerValidation.error !== null)
		{
			return res.status(200).send({ error: headerValidation.error });
		}

		// Decode token to user or setup for guest access
		const decodedTokenResult = await Ext.validateToken(req.headers['x-access-token']);
		if(decodedTokenResult.error !== null)
		{
			return res.status(200).send({ error: decodedTokenResult.error });
		}

		//console.log(token.user.authorization);

		let results = {navData: [], details: []};
		const modelMgr = ModelManager.GetInstance();
		if(req.headers['x-request-source'].toString() === 'web')
		{
			switch(decodedTokenResult.user.authorization.type)
			{
				case 'customer':
					results = [];
					break;
				case 'admin':
					const models = await modelMgr.getModelDocuments({});
					for(const idx in models)
					{
						if(models[idx].tableProperties.showInDataManager)
						{
							results.navData.push({ icon: models[idx].tableProperties.icon ? models[idx].tableProperties.icon : 'ti-menu-alt', title: models[idx].name });
						}
					}
					break;
				default:
					return res.status(200).send({ error: 'Could not find a home page for this user authorization type: ' +  decodedTokenResult.user.authorization.type});
			}
			return res.status(200).send({ error: null, results: results });
		}
		else if(req.headers['x-request-source'].toString() === 'mobile')
		{
			results = [];
		}
		else
		{
			return res.status(200).send({ error: 'Could not find a home page for source: ' +  req.headers['x-request-source'].toString()});
		}

		return res.status(200).send(
		{
			error: null,
			results: results,
			token: decodedTokenResult.token
		});
	}
	catch(err)
	{
		await Log.Error(__filename, err);
		res.status(200).send({ error: err });
	}
});




module.exports = Router;
