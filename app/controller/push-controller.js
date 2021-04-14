const Environment 		= require('../environment');
const Ext 			= require('../extension');
const {ModelManager, UtilityManager} = require('../manager');
const {Log}		= require('../model');
const Router 		= require('express').Router();
const BodyParser	= require('body-parser');
Router.use(BodyParser.urlencoded({ extended: true }));
Router.use(BodyParser.json());


/**
	API routes providing push notification related functionality
  @module push/
	@ignore
 */

 /**
   @name init
   @function
   @inner
   @description Retrieve push public key,
	 if we have an active token,
	 subscribable events which includes what we are subscribed to
   @returns {Object} {vapidPublicKey: String, pushTokenExists: Bool, subscribableEvents: Array.<Array.<JSON>}
  */
 Router.post('/init', async (req, res) =>
 {
 	const configs = []
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

		// Models
 		const modelMgr = ModelManager.GetInstance();
		const mEventSubscription = modelMgr.getModel('eventsubscription');
		const mPushToken = modelMgr.getModel('pushtoken');
		const mSubscribableEvent = modelMgr.getModel('subscribableevent');
		if(!mSubscribableEvent)
		{
			return res.status(200).send({ error: 'Could not find subscribableevent' });
		}
 		if(!mPushToken)
 		{
 			return res.status(200).send({ error: 'Could not find pushtoken' });
 		}
		if(!mEventSubscription)
 		{
 			return res.status(200).send({ error: 'Could not find eventsubscription' });
 		}

		// Find subcriptions
		const subscriptions = await mEventSubscription.find(
		{
			createdBy: decodedTokenResult.user._id,
			deliveryMethod: 'push'
		});

    // Find push token
    let params =
    {
      createdBy: decodedTokenResult.user._id,
      service: req.headers['x-device-service-name'],
      deviceId: req.headers['x-device-id']
    };
    const pushToken = await mPushToken.findOne(params);

		// Find subscribable events that are open to our authorization type
		// and have push enabled
		let subscribableEventsResults = [];
		params =
		{
			openTo: decodedTokenResult.user.authorization._id,
			'triggers.values.deliveryMethod': 'push'
		};

		// Iterate events that can be subscribed to
		const subscibableEvents = await mSubscribableEvent.find(params);
		for(let i = 0; i < subscibableEvents.length; i++)
		{
			// Check if already subscribed
			let checked = false;
			for(let j = 0; j < subscriptions.length; j++)
			{
				if(subscriptions[j].event._id.toString() === subscibableEvents[i]._id.toString())
				{
					checked = true;
					break;
				}
			}

			// Add action to existing event if already in list
			if(subscribableEventsResults.length > 0)
			{
				let wasFound = false;
				for(let j = 0; j < subscribableEventsResults.length; j++)
				{
					// Find
					if(subscribableEventsResults[j].modelType === subscibableEvents[i].modelType)
					{
						subscribableEventsResults[j].actions.push(
						{
							action: subscibableEvents[i].action,
							label: subscibableEvents[i].settingsLabel,
							checked: checked
						});
						wasFound = true;
						break;
					}
				}

				if(!wasFound)
				{
					subscribableEventsResults.push(
					{
						modelType: subscibableEvents[i].modelType,
						actions:
						[
							{
								action: subscibableEvents[i].action,
								label: subscibableEvents[i].settingsLabel,
								checked: checked
							}
						]
					});
				}
			}
			// Create new entry for event in list
			else
			{
				subscribableEventsResults.push(
				{
					modelType: subscibableEvents[i].modelType,
					actions:
					[
						{
							action: subscibableEvents[i].action,
							label: subscibableEvents[i].settingsLabel,
							checked: checked
						}
					]
				});
			}
		}

 		res.status(200).send(
 		{
 			error: null,
			token: decodedTokenResult.token,
			subscribableEvents: subscribableEventsResults,
      pushToken: pushToken,
 			vapidPublicKey: Environment.VAPID_PUBLIC_KEY,
 		});
 	}
 	catch(err)
 	{
 		await Log.Error(__filename, err);
 		res.status(200).send({ error: err.message });
 	}
 });



 /**
 	@name subscribe
 	@function
 	@inner
   @description Subscribe to push notification event
 	@param 	{JWT} 	"headers[x-access-token]"		Token to decrypt
	@ignore
   */
 Router.post('/subscribe', async (req, res) =>
 {
 	try
 	{
		// Validate headers
		const headerValidation = await Ext.validateHeaders(req.headers);
		if(headerValidation.error !== null)
		{
			return res.status(200).send({ error: headerValidation.error });
		}

		if(!req.body.subscribableEvents)
		{
			return res.status(200).send({ error: 'No subscribable events parameter' });
		}

 		// Decode token to user
 		const decodedTokenResult = await Ext.validateToken(req.headers['x-access-token']);
 		if(decodedTokenResult.error !== null)
 		{
 			return res.status(200).send({ error: decodedTokenResult.error });
 		}
		// TODO: Make validate token handle required headers, have optional parameter to handle requiring guest access or not

 		const modelMgr = ModelManager.GetInstance();
 		const mEventSubscription = modelMgr.getModel('eventsubscription');
		const mSubscribableEvent = modelMgr.getModel('subscribableevent');
		if(!mSubscribableEvent)
		{
			return res.status(200).send({ error: 'Could not find subscribableevent' });
		}
		if(!mEventSubscription)
		{
			return res.status(200).send({ error: 'Could not find eventsubscription' });
		}

		// Iterate all subscribable models first
		for(let i = 0; i < req.body.subscribableEvents.length; i++)
		{
			// Iterate events for this subscribable model
			for(let j = 0; j < req.body.subscribableEvents[i].actions.length; j++)
			{
				// Locate the event
				const eventParams =
				{
					modelType: req.body.subscribableEvents[i].modelType,
					action: req.body.subscribableEvents[i].actions[j].action,
					openTo: decodedTokenResult.user.authorization
				};
				const subscribableEvent = await mSubscribableEvent.findOne(eventParams);

				const filterQuery =
				{
					createdBy: decodedTokenResult.user._id,
					event: subscribableEvent._id,
					'trigger.model': 'user',
					'trigger.id':	'_any_',
					deliveryMethod: 'push'
				};

				// Upsert
				if(req.body.subscribableEvents[i].actions[j].checked)
				{
					console.log('Checking');
					const updateQuery =
					{
						event: subscribableEvent._id,
						trigger: {model: 'user', id:	'_any_'},
						deliveryMethod: 'push'
					};
					// Update
					let existingDoc = await mEventSubscription.findOne(filterQuery);
					if(existingDoc)
					{
						await mEventSubscription.updateById(existingDoc._id, updateQuery);
					}
					// Insert
					else
					{
						console.log('Creating');
						await mEventSubscription.create(updateQuery, decodedTokenResult.user);
					}
				}
				// Delete
				else
				{
					const result = await mEventSubscription.delete(filterQuery);
				}
			}
		}

		return res.status(200).send({
			error: null,
			token: decodedTokenResult.token,
			results: req.body.subscribableEvents
		});
 	}
 	catch(err)
 	{
 		await Log.Error(__filename, err);
 		res.status(200).send({ error: err });
 	}
 });

 /**
 	@name /
 	@function
 	@inner
   @description Trigger a push
 	@param 	{JWT} 	"headers[x-access-token]"		Token to decrypt
	@ignore
   */
 Router.post('/', async (req, res) =>
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

		const modelMgr = ModelManager.GetInstance();
		const mPushToken = modelMgr.getModel('pushtoken');
		const pushToken = await mPushToken.findOne({ createdBy: decodedTokenResult.user._id });
		if(!pushToken)
		{
			return res.status(200).send({ error: 'Could not find a push token for this user' });
		}
		const notification = await UtilityManager.GetInstance().get('pusher').SendWebPush(JSON.parse(pushToken.token));
		return res.status(200).send({
			error: null,
			token: decodedTokenResult.token,
			results: notification
		});
 	}
 	catch(err)
 	{
 		await Log.Error(__filename, err);
 		res.status(200).send({ error: err });
 	}
 });

/**
	@name token
	@function
	@inner
  @description Creates or updates a push token
	@param 	{JWT} 	"headers[x-access-token]"		Token to decrypt
	@ignore
  */
Router.post('/token', async (req, res) =>
{
	try
	{
		// Validate headers
		const headerValidation = await Ext.validateHeaders(req.headers);
		if(headerValidation.error !== null)
		{
			return res.status(200).send({ error: headerValidation.error });
		}

		if(!req.body.token)
		{
			return res.status(200).send({ error: 'No token provided.' });
		}

		// Decode token to user
		const decodedTokenResult = await Ext.validateToken(req.headers['x-access-token']);
		if(decodedTokenResult.error !== null)
		{
			return res.status(200).send({ error: decodedTokenResult.error });
		}

		const pushToken = await UtilityManager.GetInstance().get('pusher').UpsertPushToken(	decodedTokenResult.user._id,
																																											 	req.headers['x-device-service-name'],
																																										 	 	req.headers['x-device-id'],
																																										 	 	req.body.token);
		return res.status(200).send({
			error: null,
			token: decodedTokenResult.token,
			results: pushToken
		});
	}
	catch(err)
	{
		await Log.Error(__filename, err);
		res.status(200).send({ error: err });
	}
});



module.exports = Router;
