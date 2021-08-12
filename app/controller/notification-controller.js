const Environment 		= require('../environment');
const Ext 			= require('../extension');
const {ModelManager} = require('../manager');
const Mongo = require('mongoose');
const {Log}		= require('../model');
const Router 		= require('express').Router();
const BodyParser	= require('body-parser');
Router.use(BodyParser.urlencoded({ extended: true }));
Router.use(BodyParser.json());


/**
	API routes providing system-notification related functionality
  @module notification/
 */

 /**
	 @name Initialize
	 @route {POST}	/init
	 @description Retrieve notifications for a user, along with subscription preferences and alert types
	 @authentication Requires a valid x-access-token
	 @headerparam 	{JWT} 	x-access-token		Token to decrypt
	 @headerparam	{String}	x-request-source 	(web|mobile)
	 @headerparam 	{GUID}	x-device-id 	Unique ID of device calling API
	 @headerparam 	{String}	x-device-service-name 	(ios|android|chrome|safari)
	 @bodyparam 	{String}		id   ID of call to reject
	 @return {Array.<MongoDocument.<Notification>>}
  */
 Router.post('/init', async (req, res) =>
 {
 	const configs = []
 	try
 	{
	 	console.log('[Notifications.init]')

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
		const mNotification = modelMgr.getModel('notification');
    const mGeofenceAreaType = modelMgr.getModel('geofenceareatype');
    const mEventSubscription = modelMgr.getModel('eventsubscription');
		if(!mNotification)
 		{
 			return res.status(200).send({ error: 'Could not find notification model' });
 		}
    if(!mGeofenceAreaType)
 		{
 			return res.status(200).send({ error: 'Could not find geofence area type model' });
 		}
    if(!mEventSubscription)
 		{
 			return res.status(200).send({ error: 'Could not find event subscription model' });
 		}

    // Find geofence area types
    const geofenceAreaTypes = await mGeofenceAreaType.find({ isDeleted: false }, { label: 1 });

    const eventSubscriptions = await mEventSubscription.find({ createdBy: decodedTokenResult.user._id }, { createdOn: 1 });

		// Find notifications
		const notifications = await mNotification.find({ recipient: decodedTokenResult.user._id }, { createdOn: -1 });
	 	console.log(`[Notifications.init] notifications found for user ${decodedTokenResult.user._id} ${JSON.stringify(notifications)}`)

 		res.status(200).send({
			results: notifications,
      geofenceAreaTypes: geofenceAreaTypes,
      eventSubscriptions: eventSubscriptions,
			token: decodedTokenResult.token,
			error: null
		});
 	}
 	catch(err)
 	{
 		await Log.Error(__filename, err);
 		res.status(200).send({ error: err.message });
 	}
 });


 // Returns alerts (notifications) created by a user
 Router.post('/myAlerts', async (req, res) =>
 {
 	const configs = []
 	try
 	{
	 	console.log('[Notifications.myAlerts]')

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
		const mNotification = modelMgr.getModel('notification');
    const mGeofenceArea = modelMgr.getModel('geofencearea');
    const mGeofenceAreaType = modelMgr.getModel('geofenceareatype');
    const mEventSubscription = modelMgr.getModel('eventsubscription');
		if(!mNotification)
 		{
 			return res.status(200).send({ error: 'Could not find notification model' });
 		}
    if(!mGeofenceAreaType)
 		{
 			return res.status(200).send({ error: 'Could not find geofence area type model' });
 		}
    if(!mEventSubscription)
 		{
 			return res.status(200).send({ error: 'Could not find event subscription model' });
 		}

    // Find geofence area types
    // const geofenceAreaTypes = await mGeofenceAreaType.find({ isDeleted: false }, { label: 1 });
    const geofenceAreas = await mGeofenceArea.find({ createdBy: decodedTokenResult.user._id, isDeleted: false }, { createdOn: 1 });
    // const eventSubscriptions = await mEventSubscription.find({ createdBy: decodedTokenResult.user._id }, { createdOn: 1 });

		// Find notifications
		// const notifications = await mNotification.find({ recipient: decodedTokenResult.user._id }, { createdOn: -1 });
	 	console.log(`[Notifications.myAlerts] notifications found for user ${decodedTokenResult.user._id} ${JSON.stringify(geofenceAreaTypes)}`)

 		res.status(200).send({
			// results: notifications,
      geofenceAreas: geofenceAreas,
      // eventSubscriptions: eventSubscriptions,
			// token: decodedTokenResult.token,
			error: null
		});
 	}
 	catch(err)
 	{
 		await Log.Error(__filename, err);
 		res.status(200).send({ error: err.message });
 	}
 });

/**
	@name Mark Read
	@route {POST}	/mark-read
	@description Mark notifications as read
	@authentication Requires a valid x-access-token
	@headerparam 	{JWT} 	x-access-token		Token to decrypt
	@headerparam	{String}	x-request-source 	(web|mobile)
	@headerparam 	{GUID}	x-device-id 	Unique ID of device calling API
	@headerparam 	{String}	x-device-service-name 	(ios|android|chrome|safari)
	@bodyparam 	{Array.<String>}		ids   IDs of notifications to update
	@return {Array.<MongoDocument.<Notification>>} update notifications
*/
Router.post('/mark-read', async (req, res) =>
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

		if(!req.body.ids)
		{
			return res.status(200).send({ error: 'Missing ids' });
		}

		// Models
		const modelMgr = ModelManager.GetInstance();
		const mNotification = modelMgr.getModel('notification');
		if(!mNotification)
		{
			return res.status(200).send({ error: 'Could not find notification' });
		}

		// Update
		const filterQuery =
		{
			_id:
			{
				$in: req.body.ids
			}
		};
		await mNotification.updateMany(filterQuery, { status: 'read' });

		// Send back all notifications updated
		const notifications = await mNotification.find({ recipient: decodedTokenResult.user._id }, { createdOn: -1 });
		res.status(200).send({
			token: decodedTokenResult.token,
			results: notifications,
			error: null
		});
	}
	catch(err)
	{
		await Log.Error(__filename, err);
		res.status(200).send({ error: err.message });
	}
});


/**
	@name Read
	@route {POST}	/read
	@description Read a single notification
	@authentication Requires a valid x-access-token
	@headerparam 	{JWT} 	x-access-token		Token to decrypt
	@headerparam	{String}	x-request-source 	(web|mobile)
	@headerparam 	{GUID}	x-device-id 	Unique ID of device calling API
	@headerparam 	{String}	x-device-service-name 	(ios|android|chrome|safari)
	@bodyparam 	{String}		id   ID of notification to read
	@return {Object}
	Sends back type of document which is the type of entity this notification is associated with
	Sends back document which is the entity this notification is associated with
*/
Router.post('/read', async (req, res) =>
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

		if(!req.body.id)
		{
			return res.status(200).send({ error: 'Missing id' });
		}

		// Models
		const modelMgr = ModelManager.GetInstance();
		const mNotification = modelMgr.getModel('notification');
		if(!mNotification)
		{
			return res.status(200).send({ error: 'Could not find notification' });
		}

		// Mark notification read and get entity from it
		const notification = await mNotification.findOne({ _id: req.body.id });
		if(!notification)
		{
			return res.status(200).send({ error: 'Could not locate notification' });
		}
		notification.status = 'read';
		await notification.save();

		// Check if user can query this entity (Safety first)
		const mModel = modelMgr.getModel(notification.entityType);
		if(!mModel)
		{
			return res.status(200).send({ error: 'Could not find model with name {' + notification.entityType + '}' });
		}
		const canQuery = await mModel.canPerformAction('query', decodedTokenResult.user);
		if(!canQuery)
		{
			console.log(decodedTokenResult.user._id.toString() + ' tried to query ' + notification.entityType);
			return res.status(200).send({ error: 'You are not authorized to query this model type' });
		}

		// Locate entity associated with notification
		let doc = await mModel.findOne({ _id: notification.entityId });
		let entityType = notification.entityType;

		// If notification is for a comment, lookup the entity the comment is for
		if(notification.entityType === 'comment')
		{
			const mModel2 = modelMgr.getModel(doc.entityType);
			if(!mModel2)
			{
				return res.status(200).send({ error: 'Could not find model with name {' + doc.entityType + '}' });
			}
			const canQuery2 = await mModel2.canPerformAction('query', decodedTokenResult.user);
			if(!canQuery2)
			{
				console.log(decodedTokenResult.user._id.toString() + ' tried to query ' + doc.entityType);
				return res.status(200).send({ error: 'You are not authorized to query this model type' });
			}
			entityType = doc.entityType;
			doc = await mModel2.findOne({ _id: doc.entityId });

			// Entity no longer exists (could've been deleted)
			if(!doc)
			{
				return res.status(200).send({ error: 'This ' + entityType + ' no longer exists.' });
			}

			// Handle aggregate functions
			// TODO: Standardize these
			// Right now just _attach_comments_
			if(req.body.aggregate && req.body.aggregate === '_attach_comments_')
			{
				const mComment = modelMgr.getModel('comment');
				const modelType = doc.constructor.modelName;
				doc = JSON.parse(JSON.stringify(doc));
				doc.comments = await mComment.find({ entityId: doc._id, entityType: modelType }, { createdOn: 1 });
			}
		}
		// Adjust for friend request and send back user it was sent by
		else if(notification.entityType === 'friend')
		{
			doc = doc.createdBy;
			entityType = 'user';
		}
		// Otherwise just use the entity on the notification
		else
		{
			// Handle aggregate functions
			// TODO: Standardize these
			// Right now just _attach_comments_
			if(req.body.aggregate && req.body.aggregate === '_attach_comments_')
			{
				const mComment = modelMgr.getModel('comment');
				doc = JSON.parse(JSON.stringify(doc));
				doc.comments = await mComment.find({ entityId: doc._id, entityType: notification.entityType }, { createdOn: 1 });
			}
		}

		res.status(200).send(
		{
			token: decodedTokenResult.token,
			results:
			{
				document: doc,
				type: entityType
			},
			error: null
		});
	}
	catch(err)
	{
		await Log.Error(__filename, err);
		res.status(200).send({ error: err.message });
	}
});




/**
@name update-subscription
@function
@inner
@description User calls this to update their subscription settings
@ignore
*/
Router.post('/update-subscription', async (req, res) =>
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

	  if(!req.body.eventSubscriptions)
    {
      return res.status(200).send({ error: 'Missing event subscriptions' });
    }

		// Models
		const modelMgr = ModelManager.GetInstance();
		const mEventSubscription = modelMgr.getModel('eventsubscription');
		if(!mEventSubscription)
		{
			return res.status(200).send({ error: 'Could not find event subscription' });
		}

    const promises = req.body.eventSubscriptions.map( async(subscription) =>
    {
      return await mEventSubscription.updateById(subscription._id, { isDeleted: subscription.isDeleted });
    });

    Promise.all(promises);

		res.status(200).send(
		{
			token: decodedTokenResult.token,
			results: req.body.eventSubscriptions,
			error: null
		});
	}
	catch(err)
	{
		await Log.Error(__filename, err);
		res.status(200).send({ error: err.message });
	}
});


/**
@name update-subscriptions
@function
@inner
@description Admin API to update subscriptions to events (if new event added after user already registered)
@ignore
*/
Router.post('/update-subscriptions', async (req, res) =>
{
	console.log('[NotificationController.update-subscriptions]')

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

		if(decodedTokenResult.user.authorization.type !== 'admin')
		{
			return res.status(200).send({ error: 'Admin only' });
		}

		// Models
		const modelMgr = ModelManager.GetInstance();
		const mSubscribableEvent = modelMgr.getModel('subscribableevent');
		const mUser = modelMgr.getModel('user');
		const mAuthorization = modelMgr.getModel('authorization');
		const mEventSubscription = modelMgr.getModel('eventsubscription');
		if(!mSubscribableEvent)
		{
			return res.status(200).send({ error: 'Could not find subscribable event' });
		}
		if(!mUser)
		{
			return res.status(200).send({ error: 'Could not find user' });
		}
		if(!mEventSubscription)
		{
			return res.status(200).send({ error: 'Could not find event subscription' });
		}
		if(!mAuthorization)
		{
			return res.status(200).send({ error: 'Could not find authorization' });
		}

		// Get customer authorization type
		const customerAuth = await mAuthorization.findOne({ type: 'customer' });
		if(!customerAuth)
		{
			return res.status(200).send({ error: "Customer authorization type missing" });
		}

		// Get events and users for customer auth
		let subscribableEvents = await mSubscribableEvent.find(
		{
			openTo: customerAuth._id,
			$or:
			[
				{
					'triggers.values.deliveryMethod': 'system'
				},
				{
					'triggers.values.deliveryMethod': 'push'
				}
			]
		});
		let users = await mUser.find({ authorization: customerAuth._id });
		await applySubscriptionsForUsers(users, subscribableEvents, mEventSubscription);

		// Do admins
		const adminAuth = await mAuthorization.findOne({ type: 'admin' });
		if(!adminAuth)
		{
			return res.status(200).send({ error: "Admin authorization type missing" });
		}
		subscribableEvents = await mSubscribableEvent.find(
		{
			openTo: adminAuth._id,
			$or:
			[
				{
					'triggers.values.deliveryMethod': 'system'
				},
				{
					'triggers.values.deliveryMethod': 'push'
				}
			]
		});
		users = await mUser.find({ authorization: adminAuth._id });
		await applySubscriptionsForUsers(users, subscribableEvents, mEventSubscription);

		res.status(200).send(
		{
			token: decodedTokenResult.token,
			results: null,
			error: null
		});
	}
	catch(err)
	{
		await Log.Error(__filename, err);
		res.status(200).send({ error: err.message });
	}
});

async function applySubscriptionsForUsers(users, subscribableEvents, mEventSubscription)
{
	console.log('[NotificationController.applySubscriptionsForUsers] for users: ' + JSON.stringify(users))
	console.log('[NotificationController.applySubscriptionsForUsers] for mEventSubscription: ' + JSON.stringify(mEventSubscription))

	let subscription = null;
	// Iterate users
	for(let i = 0; i < users.length; i++)
	{
		// Iterate events and see who is not subscribed to what
		for(let j = 0; j < subscribableEvents.length; j++)
		{
			// Iterate delivery methods and see who does not have all
			for(let k = 0; k < subscribableEvents[j].triggers.values.length; k++)
			{
				if(subscribableEvents[j].triggers.values[k].deliveryMethod === 'system' ||
					subscribableEvents[j].triggers.values[k].deliveryMethod === 'push')
					{
						// Check if user has subscribed to this event at all
						subscription = await mEventSubscription.findOne({ event: subscribableEvents[j]._id, createdBy: users[i]._id });
						// If not create it
						if(!subscription)
						{
							console.log('[NotificationController.applySubscriptionsForUsers] creating event subscription for subscribable event: ' + subscribableEvents[j]._id)

							await mEventSubscription.create(
							{
								event: subscribableEvents[j]._id,
								trigger:
								{
									model: subscribableEvents[j].triggers.values[k].model,
									id: subscribableEvents[j].triggers.values[k].id,
                  geofenceAreaType: subscribableEvents[j].triggers.values[k].geofenceAreaType,
								},
								deliveryMethod: [subscribableEvents[j].triggers.values[k].deliveryMethod]
							}, users[i]);
						}
						// Check if they have this delivery method, if not add it
						else
						{
							if(subscription.deliveryMethod.indexOf(subscribableEvents[j].triggers.values[k].deliveryMethod) === -1)
							{
								subscription.deliveryMethod.push(subscribableEvents[j].triggers.values[k].deliveryMethod);
								await subscription.save();
							}
						}
					}
			}
		}
	}
}
module.exports = Router;
