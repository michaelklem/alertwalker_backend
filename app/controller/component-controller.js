const BodyParser    = require('body-parser');
const Ext           = require('../extension');
const { Log }           = require('../model');
const { ModelManager, NotificationManager }  = require('../manager');
const Multiparty    = require('multiparty');
const Router        = require('express').Router();

// For handling JSON
Router.use(BodyParser.urlencoded({ extended: true }));
Router.use(BodyParser.json());

/**
	API routes providing initializers for specific components
  @module component/
 	@requires express
	@ignore
 */

/**
	@name posts
	@function
	@inner
	@description Initalize a posts component with data
	@param 	{JWT} 	"headers[x-access-token]""		Token to decrypt
	@param 	{JSON}		params 		Params we can pass directly to Mongo that map to Core Model schema for model
  @return {Mongo.document}  Newly created document
*/
Router.post('/side-nav', async (req, res) =>
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

		const navData = [];
		if(decodedTokenResult.user.authorization.type === 'admin')
		{
      const modelMgr = ModelManager.GetInstance();
			const models = await modelMgr.getModelDocuments({});
			for(const idx in models)
			{
				if(models[idx].tableProperties.showInDataManager &&
					models[idx].tableProperties.authorization.indexOf(decodedTokenResult.user.authorization.type.toLowerCase()) !== -1)
				{
					navData.push({
            icon: models[idx].tableProperties.icon ? models[idx].tableProperties.icon : 'ti-menu-alt',
            title: models[idx].name,
            displayName: models[idx].tableProperties.displayName ?  models[idx].tableProperties.displayName : models[idx].name
          });
				}
			}
		}
		else if(decodedTokenResult.user._id !== 'guest')
		{
			navData.push({ title: 'Messages', link: 'messages', icon: 'icon-home-messages.png' });
	    navData.push({ title: 'Friends',  link: 'friends',  icon: 'icon-home-friends.png' });
	    navData.push({ title: 'Settings', link: 'settings', icon: 'icon-home-settings.png' });

			navData.push({ title: 'Testimonies', 	link: 'testimonies', 	icon: 'icon-home-testimonies.png' });
			navData.push({ title: 'Blog', 				link: 'blog', 				icon: 'icon-home-blog.png' });
			navData.push({ title: 'FAQ', 					link: 'faq', 					icon: 'icon-home-faq.png' });
		}

		return res.status(200).send({ error: null, results: navData, token: decodedTokenResult.token });
	}
	catch(err)
	{
		await Log.Error(__filename, err);
		res.status(200).send({ error: err });
	}
});

module.exports = Router;
