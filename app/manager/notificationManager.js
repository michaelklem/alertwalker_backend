/**
  Singleton that manages notifications
*/
class NotificationManager
{
  // MARK: - Data fields
  static #instance = null;
  // TODO: Figure out how to get access to model manager in here
  // ends up causing circular depdencies so we have to do this gross thing
  // and keep references to the model objects we need
  #mNotification = null;
  #mSubscribableEvent = null;
  #mEventSubscription = null;
  #mUser = null;
  #mConfiguration = null;
  #serverMgr = null;
  #utilityMgr = null;

  // MARK: - Constructor
  constructor()
  {
    if(NotificationManager.#instance !== null)
    {
      throw new Error('Attempt to instantiate multiple instances of NotificationManager refused');
    }

    console.log('NotificationManager instantiated successfully: true');
  }

  getServerMgr() {
    return this.#serverMgr
  }

  /**
    Initialize NotificationManager properly
    @param  {Model.<Notification>}  mNotification So we can interact with notifications
    @param  {Model.<SubscribableEvent>} mSubscribableEvent  So we can interact with subscribable events
    @param  {Model.<EventSubscription>} mEventSubscription  So we can interact with subscriptions to events
    @param  {Model.<user>} mUser  So we can interact with users
    @param  {Model.<configuration>} mConfiguration  So we can interact with configurations
    @param  {ServerManager} serverMgr   Server manager so we can interact with websocket server
    @param  {UtilityManager} utilityMgr   Utility manager so we can interact with utilities
  */
  static Init(mNotification,
              mSubscribableEvent,
              mEventSubscription,
              mUser,
              mConfiguration,
              serverMgr,
              utilityMgr)
  {
    if(!mNotification)
    {
      throw new Error('Attempt to instantiate NotificationManager without "notification" model');
    }
    if(!mSubscribableEvent)
    {
      throw new Error('Attempt to instantiate NotificationManager without "subscribableevent" model');
    }
    if(!mEventSubscription)
    {
      throw new Error('Attempt to instantiate NotificationManager without "eventsubscription" model');
    }
    if(!serverMgr)
    {
      throw new Error('Attempt to instantiate NotificationManager without "serverMgr');
    }
    if(!utilityMgr)
    {
      throw new Error('Attempt to instantiate NotificationManager without "utilityMgr');
    }
    NotificationManager.#instance = new NotificationManager();
    NotificationManager.#instance.#mNotification = mNotification;
    NotificationManager.#instance.#mSubscribableEvent = mSubscribableEvent;
    NotificationManager.#instance.#mEventSubscription = mEventSubscription;
    NotificationManager.#instance.#mUser = mUser;
    NotificationManager.#instance.#mConfiguration = mConfiguration;
    NotificationManager.#instance.#serverMgr = serverMgr;
    NotificationManager.#instance.#utilityMgr = utilityMgr;

    // Pusher needs a reference to notification manager
    utilityMgr.setNotificationManager(NotificationManager.#instance);

    return NotificationManager.#instance;
  }

  /**
    Singleton accessor
    @returns  {NotificationManager}  Only instance of manager
  */
  static GetInstance()
  {
    if(NotificationManager.#instance === null)
    {
      NotificationManager.#instance = new NotificationManager();
    }
    return NotificationManager.#instance;
  }

  async subscribeUserToEvents({ openTo, user })
  {
    return await NotificationManager.SubscribeUserToEvents({ openTo, user });
  }

  static async SubscribeUserToEvents({ openTo, user })
  {
    console.log('[NotificationManager.SubscribeUserToEvents] for user: ' + user + ' opento: ' + JSON.stringify(openTo))

    const subscribableEvents = await NotificationManager.#instance.#mSubscribableEvent.find(
		{
			openTo: openTo,
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

    console.log('[NotificationManager.SubscribeUserToEvents] found events: ' + subscribableEvents.length)

		for(let i = 0; i < subscribableEvents.length; i++)
		{
			for(let j = 0; j < subscribableEvents[i].triggers.values.length; j++)
			{
				// Only do push/system
				if(subscribableEvents[i].triggers.values[j].deliveryMethod === 'push' ||
					subscribableEvents[i].triggers.values[j].deliveryMethod === 'system')
				{

          console.log('[NotificationManager.SubscribeUserToEvents] creating event subscription for user: ' + JSON.stringify(user) + '  subscribable event: ' + subscribableEvents[i]._id)

					await NotificationManager.#instance.#mEventSubscription.create(
					{
						event: subscribableEvents[i]._id,
						trigger:
						{
							model: subscribableEvents[i].triggers.values[j].model,
							id: subscribableEvents[i].triggers.values[j].id
						},
						deliveryMethod: [subscribableEvents[i].triggers.values[j].deliveryMethod]
					}, user);
				}
			}
		}
  }

  /**
    Check if specified user has any subscriptions for this model/action pair.
    If so it will send out notifications for them.
    @param  {String} modelType  Model type that event is associated with
    @param  {String}  action  The action being performed on the model (create|like|comment|delete|query|update)
    @param  {Mongo.Document}  triggeredByEntity  The document of the entity triggering this action
    @note   Example: a post could be the triggeredByEntity. To get who it belongs to read the .createdBy
    @param  {Mongo.Document?} createdBy   This can be used to tell who created the notification, otherwise we use the triggeredByEntity.createdBy
    @returns {Bool} true
  */
  static async HandleSubscriptionsFor(modelType, action, triggeredByEntity, createdBy = null)
  {
    try
    {
      let createdByUserId = createdBy === null ? triggeredByEntity.createdBy._id : createdBy._id;
      console.log('[NotificationManager.HandleSubscriptionsFor] triggeredByEntity: ' + triggeredByEntity)
      console.log('[NotificationManager.HandleSubscriptionsFor] createdBy: ' + createdBy)
      console.log('[NotificationManager.HandleSubscriptionsFor] createdByUserId: ' + createdByUserId)
      console.log('[NotificationManager.HandleSubscriptionsFor] modelType: ' + modelType)
      console.log('[NotificationManager.HandleSubscriptionsFor] action: ' + action)

      // Build a list of subscriptions then iterate on it and create notifications
      let subscriptions = [];

      // See if there are any events for this model and action
      const subscribableEvents = await NotificationManager.#instance.#mSubscribableEvent.find({ modelType: modelType, action: action });
      if(!subscribableEvents || subscribableEvents.length === 0)
      {
        return true;
      }

      console.log('[NotificationManager.HandleSubscriptionsFor] subscribableEvents.length: ' + subscribableEvents.length)

      // Find subscriptions using logic for specific action
      if(action === 'like')
      {
        // See if anyone is subscribed to these events
        const orClause = [];
        for(let i = 0; i < subscribableEvents.length; i++)
        {
          // Handle subscriptions to this specific user
          orClause.push(
          {
            $and:
            [
              { event: subscribableEvents[i]._id },
              { 'trigger.model': triggeredByEntity.createdBy.constructor.modelName },
              { 'trigger.id': triggeredByEntity.createdBy._id }
            ]
          });

          // Handle dynamic triggers
          for(let j = 0; j < subscribableEvents[i].triggers.values.length; j++)
          {
            orClause.push(
            {
              $and:
              [
                { event: subscribableEvents[i]._id },
                { 'trigger.model': subscribableEvents[i].triggers.values[j].model },
                { 'trigger.id': subscribableEvents[i].triggers.values[j].id },
                { createdBy: triggeredByEntity.createdBy._id }
              ]
            });
          }
        }
        //console.log(JSON.stringify(orClause));

        // Find subscriptions where created by is also the person liking the entity
        subscriptions = await NotificationManager.#instance.#mEventSubscription.find({ $or: orClause, createdBy: { $ne: createdBy } });
      }
      else if(action === 'create')
      {
        // See if anyone is subscribed to these events
        const orClause = [];
        for(let i = 0; i < subscribableEvents.length; i++)
        {
          // Handle subscriptions to this specific user
          console.log('[NotificationManager.HandleSubscriptionsFor] subscribableEvent: ' + JSON.stringify(subscribableEvents[i]))

          orClause.push(
          {
            $and:
            [
              { event: subscribableEvents[i]._id },
              { 'trigger.model': triggeredByEntity.createdBy.constructor.modelName },
              { 'trigger.id': triggeredByEntity.createdBy._id },
              { isDeleted: false },  // When user unsubscribes they set this to deleted
              { 'trigger.geofenceAreaType': triggeredByEntity.type._id } // Match on subscription to specific geofence area type
            ]
          });

          // Handle dynamic triggers
          for(let j = 0; j < subscribableEvents[i].triggers.values.length; j++)
          {
            // By default filter out the person creating the notification and include the whole application user base
            let createdByFilter =
            {
              createdBy:
              {
                $ne: createdByUserId
              }
            };

            // For messages, notify all on the conversation
            if(subscribableEvents[i].modelType === 'message' && subscribableEvents[i].action === 'create')
            {
              let conversationUsers = triggeredByEntity.conversation.users.filter(user => user._id.toString() !== createdByUserId.toString());
              createdByFilter =
              {
                createdBy:
                {
                  $in: conversationUsers
                }
              };
            }

            // For calls, notify all on the call
            if(subscribableEvents[i].modelType === 'call' && subscribableEvents[i].action === 'create')
            {
              let callUsers = triggeredByEntity.users.filter(user => user._id.toString() !== createdByUserId.toString());
              createdByFilter =
              {
                createdBy:
                {
                  $in: callUsers
                }
              };
            }

            console.log('[NotificationManager.HandleSubscriptionsFor] createdByFilter: ' + JSON.stringify(createdByFilter) );

            orClause.push(
            {
              $and:
              [
                { event: subscribableEvents[i]._id },
                { 'trigger.model': subscribableEvents[i].triggers.values[j].model },
                { 'trigger.id': subscribableEvents[i].triggers.values[j].id },
                { 'trigger.geofenceAreaType': subscribableEvents[i].triggers.values[j].geofenceAreaType },
                createdByFilter,
                { isDeleted: false }
              ]
            });
          }
        }
        console.log('[NotificationManager.HandleSubscriptionsFor] orClause: ' + JSON.stringify(orClause));
        subscriptions = await NotificationManager.#instance.#mEventSubscription.find({ $or: orClause });
      }  // create

      //console.log('subscriptions');
      //console.log(subscriptions);
      //console.log('[NotificationManager.HandleSubscriptionsFor] found subscriptions: ' + JSON.stringify(subscriptions));

      // If geofence area notification then we need to filter down the list of subscriptions by users with lastLocation's in the area
      if(triggeredByEntity.constructor.modelName === 'geofencearea')
      {
        let mapDisplayAlertRadius = await NotificationManager.#instance.#mConfiguration.findOne({ name: 'MAP_DISPLAY_ALERT_RADIUS' });
        mapDisplayAlertRadius = parseInt(mapDisplayAlertRadius.value);

        // Find users near this point
        const searchParams =
        {
          lastLocation:
          {
            $near:
            {
              $maxDistance: mapDisplayAlertRadius,
              $geometry:
              {
                type: 'Point',
                coordinates: triggeredByEntity.location.coordinates
              }
            }
          }
        };
        let users = await NotificationManager.#instance.#mUser.find(searchParams);

        // Filter down to just user ID
        users = users.map( (user) =>
        {
          return user._id.toString();
        });

        console.log('Users in the area');
        console.log(users);

        const subscriptionCreatedBy = subscriptions.map( (subscription) =>
        {
          return subscription.createdBy._id.toString();
        });
        console.log(subscriptionCreatedBy);

        // Filter subscriptions by users in this list
        subscriptions = subscriptions.filter( (subscription) =>
        {
          return users.indexOf(subscription.createdBy._id.toString()) !== -1;
        });

        console.log(subscriptions);
      }

      // Iterate subscriptions and create notifications
      for(let i = 0; i < subscriptions.length; i++)
      {
        let notification = null;

        // Don't create notification here because location/geofence route will do it
        // If this method is called for geofencealert create action then just do system notification (websocket)
        if(triggeredByEntity.constructor.modelName !== 'geofencearea')
        {
          const createParams =
          {
            entityId: triggeredByEntity._id,
            entityType: triggeredByEntity.constructor.modelName,
            title: subscriptions[i].event.title,
            body: subscriptions[i].event.body, //triggeredByEntity.createdBy.username + ' has created a new post',
            createdByAction: action,
            recipient: subscriptions[i].createdBy._id,
            status: 'unread',
          };
          notification = await NotificationManager.#instance.#mNotification.create(createParams, createdBy === null ? triggeredByEntity.createdBy : createdBy);
        }

        // Notify user how they have chosen to have the notification delivered
        for(let j = 0; j < subscriptions[i].deliveryMethod.length; j++)
        {
          console.log('[NotificationManager.HandleSubscriptionsFor] Processing notification with subscription: ' + JSON.stringify(subscriptions));

          switch(subscriptions[i].deliveryMethod[j])
          {
            case 'email':
              // Send email
              break;
            case 'push':
              // Notify user via push notification
              console.log('   [NotificationManager.HandleSubscriptionsFor] push subscriptions[i]: ' + JSON.stringify( subscriptions[i] ));
              console.log('   [NotificationManager.HandleSubscriptionsFor] push notification: ' +  JSON.stringify(notification) );
              console.log('   [NotificationManager.HandleSubscriptionsFor] push triggeredByEntity: ' + JSON.stringify(triggeredByEntity) );

              const utilityMgr = NotificationManager.#instance.#utilityMgr;
              await utilityMgr.get('pusher').SendPushForSubscription({
                eventSubscription: subscriptions[i],
                notification: notification,
                entity: triggeredByEntity,
                createdByUserId: createdByUserId });
              break;
            case 'sms':
              // Send text message
              break;
            case 'system':
              try {
                // Notify user via websocket if available
                const serverMgr = NotificationManager.#instance.#serverMgr;

                console.log('   [NotificationManager.HandleSubscriptionsFor] system subscriptions[i]: ' + JSON.stringify( subscriptions[i] ));
                console.log('   [NotificationManager.HandleSubscriptionsFor] system notification: ' +  notification );
                console.log('   [NotificationManager.HandleSubscriptionsFor] system triggeredByEntity: ' + triggeredByEntity );

                if(notification)
                {
                  console.log('[NotificationManager.HandleSubscriptionsFor] sending notification via socket')
                  serverMgr.get('websocket').sendNotification(subscriptions[i].createdBy._id, notification);
                }
                else
                {
                  console.log('[NotificationManager.HandleSubscriptionsFor] sending geofencearea via socket')
                  serverMgr.get('websocket').sendGeofenceArea(subscriptions[i].createdBy._id, triggeredByEntity);
                }
              }
              catch(err){
                console.log('[NotificationManager.HandleSubscriptionsFor] system error: ' + err);
              }
              break;
            default:
              throw new Error('Invalid delivery method: ' + subscriptions[i].deliveryMethod[j]);
          }
        }
      }
    }
    catch(err)
    {
      console.log('[NotificationManager.HandleSubscriptionsFor] ' + err.message + '\nStack: ' + err.stack);
    }
  }







  /**
    Parse out notification body and substitute pointers with actual values
    @param  {Notification}  notification  The notification to parse
    @returns  {String}  parsed body
  */
  parseNotificationBody(notification)
  {
    let parsedBody = '';
    let processingBody = notification.body;
    let index = processingBody.indexOf('{{');
    let ptrValue = '';
    while(index !== -1)
    {
      if(index !== 0)
      {
        parsedBody += processingBody.substr(0, index);
      }
      ptrValue = processingBody.substr(index + 2, processingBody.indexOf('}}') - 2);
      processingBody = processingBody.substr(processingBody.indexOf('}}'), processingBody.length);
      parsedBody += this.extractValueFromPointer(ptrValue, notification);
      index = processingBody.indexOf('{{');
    }
    if(processingBody.length > 0)
    {
      parsedBody += processingBody.replace('}}', '');
    }
    return parsedBody;
  }

  extractValueFromPointer(iFieldName, iRow)
  {
    //console.log(iFieldName);

    var visibleText = "";
    var fieldName = iFieldName;
    var fieldNameInPtr = "";
    var row = iRow;

    // Get total pointers in key
    let occurrences = (fieldName.match(/\./g) || []).length;
    if(occurrences === 0)
    {
      return iRow[iFieldName];
    }

    // Iterate all pointers
    var splitIndex = -1;
    for(var i = 0; i < occurrences; i++)
    {
      splitIndex = fieldName.indexOf('.');
      try
      {
        // Extract pointer
        fieldNameInPtr  = fieldName.substring(splitIndex + 1);
        fieldName = fieldName.substring(0, splitIndex);

        // Slowly parse down the data
        if(fieldNameInPtr.indexOf('.') !== -1)
        {
          row = row[fieldName];
        }
        else
        {
          return row[fieldName][fieldNameInPtr];
        }
        fieldName = fieldNameInPtr;
      }
      catch(err)
      {
        console.log("Pointer: " + fieldNameInPtr + " not found in property " + fieldName)
        return "";
      }
    }
  }


}

module.exports = NotificationManager;
