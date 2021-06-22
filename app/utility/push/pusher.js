const Aws         = require('aws-sdk');
const Environment = require('../../environment');
const WebPush     = require('web-push');

/**
  Responsible for handling AWS Pinpoint interactions
*/
class Pusher
{
  // MARK: - Data fields
  #awsClient = null;
  //#firebaseClient = null;

  // MARK: - Static fields
  static #instance = null;
  static serviceRegions = ['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'ap-east-1', 'af-south-1',
    'ap-south-1', 'ap-northeast-3', 'ap-northeast-2', 'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ca-central-1',
  'cn-north-1', 'cn-northwest-1', 'eu-central-1', 'eu-west-1', 'eu-west-2', 'eu-south-1', 'eu-west-3', 'eu-north-1', 'sa-east-1'];

  #modelMgr = null;
  #notificationMgr = null;

  // Must match what is defined in mobile PushManager.#channelId
  #androidChannelId = 'alert-walker-channel';

  #pinpointAppId = '';

  constructor()
  {
    if(Pusher.#instance !== null)
    {
      throw new Error('Attempt to instantiate multiple instances of Pusher refused');
    }

    // Instantiate AWS client
    const awsConfig =
    {
      accessKeyId: Environment.AWS_ACCESS_KEY_ID,
      secretAccessKey: Environment.AWS_SECRET_ACCESS_KEY,
      region: Environment.AWS_PIN_POINT_REGION
    };
    this.#awsClient = new Aws.Pinpoint(awsConfig);

    // Instantiate WebPush
    if(Environment.VAPID_PUBLIC_KEY !== -1 && Environment.VAPID_PUBLIC_KEY !== '-1')
    {
      WebPush.setVapidDetails('mailto:' + Environment.EMAIL_FROM_EMAIL,
                              Environment.VAPID_PUBLIC_KEY,
                              Environment.VAPID_PRIVATE_KEY);
    }

    console.log('Pusher instantiated successfully: true');
  }


  static async Init(modelMgr)
  {
    if(Pusher.#instance !== null)
    {
      throw new Error('Attempted to instantiate multiple instances of Pusher');
    }
    Pusher.#instance = new Pusher();
    Pusher.#instance.#modelMgr = modelMgr;
    const mConfiguration = modelMgr.getModel('configuration');
    let pinpointAppId = await mConfiguration.findOne({ name: 'AWS_PIN_POINT_APP_ID' });
    Pusher.#instance.#pinpointAppId = pinpointAppId.value;
  }

  /**
    Singleton accessor
    @returns  {Pusher}  Only instance of Pusher
  */
  static GetInstance()
  {
    if(Pusher.#instance === null)
    {
      Pusher.#instance = new Pusher();
    }
    return Pusher.#instance;
  }

  setNotificationManager(mgr)
  {
    this.#notificationMgr = mgr;
  }

  awsClient()
  {
    return this.#awsClient;
  }
  /**
    Create new application in pin point
    @param  {String}  title   Title of the application
    @returns {String} ApplicationId if successful or blank on error
  */
  static async CreateApplication(title)
  {
    const params =
    {
      CreateApplicationRequest: { Name: title }
    };

    const pusher = await Pusher.GetInstance();
    const result = await pusher.awsClient().createApp(params).promise();
    console.log('[Pusher] CreateApplication: ' + result);
    return result.ApplicationResponse.Id;
  }

  /**
    Setup APNS channel (iOS push notifications)
    @param  {String}  appId   Id of application to create channel on
    @param  {String}  bundleId  iOS Bundle ID
    @param  {RSAKey}  key  https://developer.apple.com/account/ios/authkey/
    @param  {String}  keyId   ID of the key
    @param  {String}  teamId https://developer.apple.com/account/#/membership/
    @param  {Bool}    sandboxMode To use sandbox mode or not
  */
  static async CreateApnsChannel(appId,
                                bundleId,
                                key,
                                keyId,
                                teamId,
                                sandboxMode)
  {
    const params = { };
    const messageType = sandboxMode ? 'APNSSandboxChannelRequest' : 'APNSChannelRequest';
    params[messageType] =
    {
      BundleId: bundleId,
      DefaultAuthenticationMethod: 'key',
      Enabled: true,
      TeamId: teamId,
      TokenKey: key,
      TokenKeyId: keyId
    };
    params['ApplicationId'] = appId;

    const pusher = await Pusher.GetInstance();
    const result = (sandboxMode ? await pusher.awsClient().updateApnsSandboxChannel(params).promise() : await pusher.awsClient().updateApnsChannel(params).promise());
    console.log('[Pusher] CreateApnsChannel result: ' + result);
    return result;
  }

  /**
    Setup GCM channel (Android push notifications)
    @param  {String}  appId   Id of application to create channel on
    @param  {String}  firebaseServerKey  Google service key
  */
  static async CreateGcmChannel(appId,
                                firebaseServerKey)
  {
    const params =
    {
      ApplicationId: appId,
      GCMChannelRequest:
      {
        ApiKey: firebaseServerKey,
        Enabled: true
      }
    };
    const pusher = await Pusher.GetInstance();
    const result = await pusher.awsClient().updateGcmChannel(params).promise();
    console.log('[Pusher] CreateGcmChannel result: ' + result);
    return result;
  }

  /**
    Finds orphan token for user (when they were a guest) and stamps their user ID onto it
    @param  {String}  userId   ID Of user
    @param  {String}  service   (ios|android)
    @param  {String}  deviceId   ID of the device
    @returns {PushToken} Newly updated push token document
  */
  static async FixOrphanToken(userId, service, deviceId)
  {
    if(Pusher.#instance === null)
    {
      throw new Error('Pusher not instantiated');
    }

    const mPushToken = Pusher.#instance.#modelMgr.getModel('pushtoken');
    let pushToken = null;

    let params =
    {
      createdBy: { $exists: false },
      service: service,
      deviceId: deviceId
    };
    pushToken = await mPushToken.findOne(params);

    // Update
    if(pushToken)
    {
      // Check if this user already has a push token registered
      const registeredPushToken = await mPushToken.updateById({ user: userId, token: pushToken.token });

      // If so just kill this orphan (that sounds awful)
      if(registeredPushToken)
      {
        await mPushToken.delete({ _id: pushToken._id });
        pushToken = registeredPushToken;
      }

      // Otherwise assign user to orphan token
      else
      {
        pushToken = await mPushToken.updateById(pushToken._id, { user: userId });
      }
    }

    /* There is a scenario where a user can logout of one account and into another.
        We need to check if there is a token for this device/service that doesn't belong to this userId
        if so then steal it and assign the current user to it  */
    params =
    {
      createdBy: { $ne: userId },
      service: service,
      deviceId: deviceId
    };
    //console.log(params);
    const difUserSameDeviceToken = await mPushToken.findOne(params);
    //console.log(difUserSameDeviceToken);
    if(difUserSameDeviceToken)
    {
      difUserSameDeviceToken.user = userId;
      pushToken = await difUserSameDeviceToken.save();
      //pushToken = await mPushToken.create({ user: userId, service: service, deviceId: deviceId, token: difUserSameDeviceToken.token });
    }
    return pushToken;
  }

  /**
    Upsert push token for user
    @param  {CoreModel} mPushToken  Model for push token (Circular dependency if we include model manager in a utility)
    @param  {String}  userId   ID Of user or guest
    @param  {String}  service   (ios|android))
    @param  {String}  token   Unique token of device intended to receive notification
    @param  {String}  deviceId   ID of the device
    @returns {PushToken} Newly updated push token document
  */
  static async UpsertPushToken(userId, service, deviceId, token)
  {
    console.log('[Pusher.UpsertPushToken]')

    if(Pusher.#instance === null)
    {
      throw new Error('Pusher not instantiated');
    }

    const mPushToken = Pusher.#instance.#modelMgr.getModel('pushtoken');
		let pushToken = null;

		// Guest
		if(userId.toString() === 'guest')
		{
			pushToken = await mPushToken.findOne({ service: service, deviceId: deviceId, createdBy: { $exists: false } });
		}
		// User
		else
		{
      //console.log('User ID: ' + userId + '\nService: ' + service + '\nDevice ID: ' + deviceId);
			pushToken = await mPushToken.findOne({ createdBy: userId, service: service, deviceId: deviceId });
		}

		// Create
		if(!pushToken)
		{
			if(userId.toString() === 'guest')
			{
				pushToken = await mPushToken.create({ service: service, deviceId: deviceId, token: token });
			}
			else
			{
				pushToken = await mPushToken.create({ service: service, deviceId: deviceId, token: token }, userId);
			}
		}
		// Update
		else
		{
			pushToken = await mPushToken.updateById(pushToken._id, { createdBy: userId, service: service, deviceId: deviceId, token: token });
		}
    return pushToken;
  }

  /**
    Initiate push notification
    @param  {Notification}  notification  The notification this is associated with
    @param  {String}  onOpenAction   Action to perform when push notification is opened (OPEN_APP, DEEP_LINK, URL)
    @param  {String?}  url   Optional parameter requried if action is URL or DEEP_LINK
    @param  {PushToken} pushToken   The push token record for this user/device
    @param  {String}    createdBy   ID of the user that initiated the notification (or system if system did it automatically)
    @param  {String}    createdByAction The action that caused the notification to be sent (for reporting purposes only)
    @returns {Bool} true on success/false on error
  */
  static async SendPush({ notification,
                          onOpenAction,
                          url,
                          pushToken,
                          createdBy,
                          createdByAction })
  {
    try
    {
      console.log('[Pusher.SendPush]')

      if(Pusher.#instance === null)
      {
        throw new Error('Pusher not instantiated');
      }

      let body = Pusher.#instance.#notificationMgr.parseNotificationBody(notification);

      const mPushNotification = Pusher.#instance.#modelMgr.getModel('pushnotification');
      let messageRequest = {};

      /*  The priority of the push notification. If the value is 'normal', then the
          delivery of the message is optimized for battery usage on the recipient's
          device, and could be delayed. If the value is 'high', then the notification is
          sent immediately, and might wake a sleeping device. */
      const priority = 'normal';

      if(pushToken.service === 'ios')
      {
        messageRequest =
        {
          'Addresses':
          {
            [pushToken.token.token]:
            {
              'ChannelType' : Environment.LIVE === 'true' ? 'APNS' : 'APNS_SANDBOX'
            }
          },
          'MessageConfiguration':
          {
            'APNSMessage':
            {
              'Action': onOpenAction,
              'Body': body,
              'Priority': priority,
              'SilentPush': false,
              'Title': notification.title,
              'TimeToLive': 30,
              'Url': notification._id.toString()
            }
          }
        };
      }
      else if(pushToken.service == 'android')
      {
        const rawContent =
        {
          notification:
          {
            title: notification.title,
            body: body,
            sound: "default",
          },
          data:
          {
            title: notification.title,
            body: body,
            deeplink: notification._id.toString(),
            action: onOpenAction,
            android_channel_id: Pusher.#instance.#androidChannelId
          }
        };

        messageRequest =
        {
          'Addresses':
          {
            [pushToken.token.token]:
            {
              'ChannelType' : 'GCM'
            }
          },
          'MessageConfiguration':
          {
            'GCMMessage':
            {
              'Action': onOpenAction,
              'Body': body,
              'Priority': priority,
              'SilentPush': false,
              'Title': notification.title,
              'TimeToLive': 30,
              'Url': notification._id.toString(),
              // Defining 'RawContent' here, everything ("message") else in the "MessageConfiguration" will be ignored
              'RawContent' : JSON.stringify(rawContent)
            }
          }
        };
      }
      else
      {
        return false;
      }

      const params =
      {
        'ApplicationId': Pusher.#instance.#pinpointAppId,
        'MessageRequest': messageRequest
      };

      console.log('[Pusher] SendPush messageRequest params: ' + JSON.stringify( params ));

      const pusher = await Pusher.GetInstance();
      const result = await pusher.awsClient().sendMessages(params).promise();
      console.log('[Pusher] SendPush sendMessages: ' + result.MessageResponse.RequestId);
      console.log('[Pusher] SendPush sendMessages: ' + JSON.stringify(result.MessageResponse.Result));

      const pushNotification = await mPushNotification.create(
      {
        notification: notification._id,
        onOpenAction: onOpenAction,
        pushToken: pushToken,
        url: url,
        result: 'unopened',
        createdByAction: createdByAction,
      }, createdBy);

      return pushNotification;
    }
    catch(err)
    {
      console.log('[Pusher] error: ' + err);
      return null;
    }
  }

  /**
    Initiate web push notification
    @param  {PushToken}  pushToken Push token with endpoint key
    @param  {Notification}  notification  Notification to send
    @returns {Bool} true on success/false on error
  */
  static async SendWebPush({ pushToken, notification })
  {
    console.log('[Pusher.SendWebPush]')
    if(Pusher.#instance === null)
    {
      throw new Error('Pusher not instantiated');
    }

    try
    {
      const options =
      {
        vapidDetails:
        {
          subject: 'mailto:' + Environment.EMAIL_FROM_EMAIL,
          publicKey: Environment.VAPID_PUBLIC_KEY,
          privateKey: Environment.VAPID_PRIVATE_KEY
        },
        timeout: 60000,
        TTL: 60,
      }

      const result = await WebPush.sendNotification(pushToken.token, JSON.stringify(notification), options);
      return true;
    }
    catch(err)
    {
      if(err.statusCode.toString() === '410')
      {
        console.log("Web push token expired, deleting: " + pushToken._id.toString());
        pushToken.isDeleted = true;
        await pushToken.save();
        return true;
      }
      else
      {
        console.log(err.statusCode.toString());
      }
      console.log(err);
      return false;
    }
  }

  /**
    Send push notifications to all tokens for given subscription and notification details
    will handle doing mobile push and web push
    @param  {EventSubscription}  eventSubscription Subscription object
    @param  {Notification}  notification  Notification to send
    @param  {Object}  entity  the entity that caused the notification to be created
    @returns {Bool} true on success/false on error
  */
  static async SendPushForSubscription({  eventSubscription,
                                          notification,
                                          entity,
                                          createdByUserId = null })
  {
    if(Pusher.#instance === null)
    {
      throw new Error('Pusher not instantiated');
    }
    const mPushToken = Pusher.#instance.#modelMgr.getModel('pushtoken');
    const pushTokens = await mPushToken.find({ createdBy: eventSubscription.createdBy._id, isDeleted: false });
    for(let i = 0; i < pushTokens.length; i++)
    {
      if(pushTokens[i].service === 'ios' || pushTokens[i].service === 'android')
      {
        console.log(pushTokens[i]._id.toString());
        await Pusher.SendPush({
         notification: notification,
         onOpenAction: 'DEEP_LINK',
         url: entity._id.toString(),
         pushToken: pushTokens[i],
         createdBy: createdByUserId,
         createdByAction: 'message'
       });
      }
      else
      {
        await Pusher.SendWebPush({
          notification: notification,
          pushToken: pushTokens[i]
        });
      }
    }
    return true;
  }

  /**
    Send push notifications to all tokens for given subscription and notification details
    will handle doing mobile push and web push
    @param  {EventSubscription}  eventSubscription Subscription object
    @param  {Notification}  notification  Notification to send
    @param  {Object}  entity  the entity that caused the notification to be created
    @returns {Bool} true on success/false on error
  */
  static async SendPushNoSubscription({ notification,
                                        entity,
                                        createdByUserId })
  {
    if(Pusher.#instance === null)
    {
      throw new Error('Pusher not instantiated');
    }
    const mPushToken = Pusher.#instance.#modelMgr.getModel('pushtoken');
    const pushTokens = await mPushToken.find({ createdBy: createdByUserId, isDeleted: false });
    for(let i = 0; i < pushTokens.length; i++)
    {
      if(pushTokens[i].service === 'ios' || pushTokens[i].service === 'android')
      {
        await Pusher.SendPush({
         notification: notification,
         onOpenAction: 'DEEP_LINK',
         url: entity._id.toString(),
         pushToken: pushTokens[i],
         createdBy: createdByUserId,
         createdByAction: 'message'
       });
      }
      else
      {
        await Pusher.SendWebPush({
          notification: notification,
          pushToken: pushTokens[i]
        });
      }
    }
    return true;
  }
}

// TODO: Option to get notification on login from new device

module.exports = Pusher;
