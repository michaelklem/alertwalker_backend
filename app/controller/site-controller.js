const {Log} 				= require('../model');
const Twilio 				= require('twilio');
const Environment 	= require('../environment');
const Ext 					= require('../extension');
const Router 				= require('express').Router();
const BodyParser		= require('body-parser');
const Mongo 		  	= require('mongoose');
const Querystring 	= require('querystring');
const {ModelManager, OauthManager, SiteManager} = require('../manager');
Router.use(BodyParser.urlencoded({ extended: true }));
Router.use(BodyParser.json());

/**
	Site routes providing general site related functionality like component style retrieval
  @module site/
 	@ignore
 */


/**
  @name styles
  @function
  @inner
  @description Get page components and styles
  @returns {Array.<StyleField>} Styles
 */
Router.post('/styles', async (req, res) =>
{
	try
	{
		// Validate headers
		const headerValidation = await Ext.validateHeaders(req.headers);
		if(headerValidation.error !== null)
		{
			return res.status(200).send({ error: headerValidation.error });
		}

		const modelMgr = ModelManager.GetInstance();
		const mComponent = modelMgr.getModel('component');
		if(!mComponent)
		{
			return res.status(200).send({ error: 'Could not initialize styles' });
		}
		const results = await mComponent.find(req.body.params, req.body.sort);
		res.status(200).send({ error: null, results: results });
	}
	catch(err)
	{
		await Log.Error(__filename, err);
		res.status(200).send({ error: err });
	}
});




/**
  @name init
  @function
  @inner
  @description Retrieve all properties of site (Components/FRONTEND_TITLE/Pages)
  @returns {Object} <Component, Array.<StyleField>>, String, Object.<String, Array.<SchemaField>
 */
Router.post('/init', async (req, res) =>
{
	const configs = []
	try
	{
		// Validate headers
		const headerValidation = await Ext.validateHeaders(req.headers, {bypassToken: true});
		if(headerValidation.error !== null)
		{
			return res.status(200).send({ error: headerValidation.error });
		}

		const modelMgr = ModelManager.GetInstance();

		// Find components
		const mComponent = modelMgr.getModel('component');
		if(!mComponent)
		{
			return res.status(200).send({ error: 'Could not find components' });
		}
		const components = await mComponent.find({});

		// Populate schema fields in component proprety if exists
		let populatedComponents = [];
		for(let i = 0; i < components.length; i++)
		{
			populatedComponents.push(JSON.parse(JSON.stringify(components[i])));
			if(components[i].properties.schemaFields && components[i].properties.schemaFields.length > 0)
			{
				const keys = Object.keys(components[i].properties.schemaFields);
				for(let j = 0; j < keys.length; j++)
				{
					// Find core doc that this schema field belongs to
					const model = keys[j].substr(0, keys[j].indexOf('_'));
					const modelDoc = await modelMgr.getModel(model).getCoreDocument();

					const schemaFieldName = keys[j].substr(keys[j].indexOf('_') + 1);
					for(let k = 0; k < modelDoc.schemaFields.length; k++)
				  {
						// Find schema field
				    if(modelDoc.schemaFields[k].name === schemaFieldName)
				    {
				      populatedComponents[i].properties.schemaFields[keys[j]] = modelDoc.schemaFields[k];
				      break;
				    }
				  }
				}
			}
		}

		// Find pages
		const siteMgr = SiteManager.GetInstance();
		const pages = await siteMgr.getPages(req.headers['x-request-source']);

		const mConfiguration = modelMgr.getModel('configuration');

		// Frontend URL
		let frontendUrl = await mConfiguration.findOne({ name: 'FRONTEND_URL '});
		frontendUrl = frontendUrl.value;

		let oauthTokens =
		{
			appleToken: '',
			facebookToken: '',
			googleToken: '',
			instagramToken: '',
			microsoftToken: ''
		};

		let thirdPartyAccounts = [];
		if(req.headers['x-access-token'])
		{
			// Decode token to user ID and locate user
			const decodedTokenResult = await Ext.validateToken(req.headers['x-access-token']);
			if(decodedTokenResult.error === null)
			{
				oauthTokens = await OauthManager.GetInstance().getTokensForUser(decodedTokenResult.user._id);
				const mThirdPartyAccount = modelMgr.getModel('thirdpartyaccount');
				thirdPartyAccounts = await mThirdPartyAccount.find({ createdBy: decodedTokenResult.user._id });
			}
		}
		/* Commenting this out as using MAP_CREATE_DELTA to restrict map view itself instead of marker
		let mapCreateRadius = await mConfiguration.findOne({ name: 'MAP_CREATE_RADIUS' });
		mapCreateRadius = mapCreateRadius.value;
		*/

		let mapCreateDelta = await mConfiguration.findOne({ name: 'MAP_CREATE_DELTA' });
		mapCreateDelta = mapCreateDelta.value;

		res.status(200).send(
		{
			error: null,
			components: populatedComponents,
			frontendTitle: Environment.FRONTEND_TITLE,
			guestAccessAllowed: false,
			pages: pages,
			internalTypes: siteMgr.getInternalTypes(),
			instagramAppId: '',
			frontendUrl: frontendUrl,
			oauthTokens: oauthTokens,
			thirdPartyAccounts: thirdPartyAccounts,
			//mapCreateRadius: mapCreateRadius,
		});
	}
	catch(err)
	{
		await Log.Error(__filename, err);
		res.status(200).send({ error: err.message });
	}
});


/**
	@name link
	@function
	@inner
  @description Handles deep link redirection (Gmail strips href so we have to do this)
	@param 	{JWT} 	"headers[x-access-token]"		Token to decrypt
  */
Router.get('/link', (req, res) =>
{
	console.log(req.body);
	if(req.query.url)
	{
		res.redirect(301, req.query.url);
	}
});


module.exports = Router;
