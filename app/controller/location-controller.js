const BodyParser	= require('body-parser');
const Environment 		= require('../environment');
const Ext 			= require('../extension');
const Log			= require('../model').Log;
const { ModelManager, UtilityManager } 	= require('../manager');
const Router 		= require('express').Router();

Router.use(BodyParser.urlencoded({ extended: true }));
Router.use(BodyParser.json());


/**
	API routes providing location related functionality
  @module location/
 */

 /**
 	@name Geofence
 	@route {POST}	/geofence
 	@description Check for geofence locations near a user's location
 	@authentication Requires a valid x-access-token
 	@headerparam 	{JWT} 	x-access-token		Token to decrypt
 	@headerparam	{String}	x-request-source 	(web|mobile)
 	@headerparam 	{GUID}	x-device-id 	Unique ID of device calling API
 	@headerparam 	{String}	x-device-service-name 	(ios|android|chrome|safari)
 	@bodyparam 	{String}  longitude   The longitude
  @bodyparam 	{String}  latitude   The latitude
  @bodyparam 	{String?}  accuracy   The accuracy (optional)
  @return {Array.<MongoDocument.<GeofenceArea>>}  List of genfence areas meeting this user's location
 */
Router.post('/geofence', async (req, res) =>
{
  let decodedTokenResult = null;
	try
	{
		// Validate headers
		const headerValidation = await Ext.validateHeaders(req.headers);
		if(headerValidation.error !== null)
		{
			return res.status(200).send({ error: headerValidation.error });
		}

    // Validate user
		decodedTokenResult = await Ext.validateToken(req.headers['x-access-token']);
		if(decodedTokenResult.error !== null)
		{
			return res.status(200).send({ error: decodedTokenResult.error });
		}

    // console.log('[LocationController] geofence authenticated' )

    // Find geofenced areas nearby
    const utilityMgr = UtilityManager.GetInstance();
		const modelMgr = ModelManager.GetInstance();
		const mGeofenceArea = modelMgr.getModel('geofencearea');
    const mNotification = modelMgr.getModel('notification');
		const mUser = modelMgr.getModel('user');
		const mEventSubscription = modelMgr.getModel('eventsubscription');

		// Get user's event subscriptions so we can filter out what events to display
		const eventSubscriptions = await mEventSubscription.find({ createdBy: decodedTokenResult.user._id, isDeleted: false });
	 	const types = eventSubscriptions.map( (subscription => {
	 	 	return subscription.trigger.geofenceAreaType;
	 	}));

    await Promise.all(req.body.map( async(location, i) =>
    {

      if(!location.latitude ||
         !location.longitude ||
         !location.accuracy)
  		{
  			res.status(200).send({ error: 'Missing params' });
  		}

			// Save user's last location
			await mUser.updateById(decodedTokenResult.user._id,
			{
				lastLocation:
				{
	 			 type: 'Point',
	 			 coordinates: [location.longitude, location.latitude]
	 		 	}
			});


      // get alerts created within the last two hours and within 500 meters of the users location
			var d = new Date();
      d.setHours(d.getHours() - 2);

      let query = {
        location:
        {
          $near:
          {
            $maxDistance: 500,
            $geometry:
            {
              type: 'Point',
              coordinates: [location.longitude, location.latitude]
            }
          }
        },
				createdOn:
				{
					$gte: d
				},
        // Ignore alerts created by the user
				createdBy:
				{
					$ne: decodedTokenResult.user._id
				},
				type:
		 		{
		 		 	$in: types
		 		}
      }

      const geofenceAreas = await mGeofenceArea.find(query);

      console.log(`[LocationController.geofence] query: ${JSON.stringify(query)}`)
      console.log(`[LocationController.geofence] geofenceAreas around user: ${decodedTokenResult.user._id} who is at location:  LAT:${location.latitude}, LNG:${location.longitude} = ${JSON.stringify(geofenceAreas)}` )

      // Send push notification for all geofence areas
      await Promise.all(geofenceAreas.map( async(geofenceArea, j) =>
      {
        // Make sure a notification for this geofence area doesn't exist yet
        // Has this user been sent a notification already?
        const prevNotification = await mNotification.findOne({
          createdBy: decodedTokenResult.user._id,
          entityId: geofenceArea._id
        });

        if(!prevNotification)
        {
					console.log(`[LocationController.geofence] Triggering geofence notification for area: ${geofenceArea._id} for user ${decodedTokenResult.user._id}`);
          const createParams =
          {
            entityId: geofenceArea._id,
            entityType: geofenceArea.constructor.modelName,
            title: 'Alert near you!',
            body: geofenceArea.note,
            createdByAction: 'create',
            recipient: decodedTokenResult.user._id,
            status: 'unread',
						type: geofenceArea.type._id
          };
          const notification = await mNotification.create(createParams, decodedTokenResult.user._id);
          console.log('[LocationController.geofence] calling SendPushNoSubscription')
          return await utilityMgr.get('pusher').SendPushNoSubscription(
          {
            notification: notification,
            entity: geofenceArea,
            createdByUserId: decodedTokenResult.user._id
          });
        }
        else {
					console.log(`[LocationController] NOT Triggering geofence notification for area: ${geofenceArea._id} Previous notification: ${JSON.stringify(prevNotification)}`);
        }
        return true;
      })); // notifications

      //console.log(geofenceAreas);
      return true;
    })); // promise



		// Success
    console.log('[loation-controller] geofence returning with token: ' + decodedTokenResult.token)
		res.status(200).send({ results: true, error: null, token: decodedTokenResult.token });
	}
	catch(err)
	{
    console.log('[geofence] error: ' + err);
    res.status(200).send({ error: err });
	}
});


/**
 @name Map
 @route {POST}	/map
 @description Query nearby geofence area's for user
 @authentication Requires a valid x-access-token
 @headerparam 	{JWT} 	x-access-token		Token to decrypt
 @headerparam	{String}	x-request-source 	(web|mobile)
 @headerparam 	{GUID}	x-device-id 	Unique ID of device calling API
 @headerparam 	{String}	x-device-service-name 	(ios|android|chrome|safari)
 @bodyparam 	{String}  longitude   The longitude
 @bodyparam 	{String}  latitude   The latitude
 @bodyparam 	{String?}  accuracy   The accuracy (optional)
 @return {Array.<MongoDocument.<GeofenceArea>>}  List of genfence areas meeting this user's location
*/
Router.post('/map', async (req, res) =>
{
 let decodedTokenResult = null;
 try
 {
   // Validate headers
   const headerValidation = await Ext.validateHeaders(req.headers);
   if(headerValidation.error !== null)
   {
     return res.status(200).send({ error: headerValidation.error });
   }

   // Validate user
   decodedTokenResult = await Ext.validateToken(req.headers['x-access-token']);
   if(decodedTokenResult.error !== null)
   {
     return res.status(200).send({ error: decodedTokenResult.error });
   }

   // Find geofenced areas nearby
   const utilityMgr = UtilityManager.GetInstance();
   const modelMgr = ModelManager.GetInstance();
   const mGeofenceArea = modelMgr.getModel('geofencearea');
   const mConfiguration = modelMgr.getModel('configuration');
	 const mEventSubscription = modelMgr.getModel('eventsubscription');
	 const mUser = modelMgr.getModel('user');
   let mapDisplayAlertRadius = await mConfiguration.findOne({ name: 'MAP_DISPLAY_ALERT_RADIUS' });
   mapDisplayAlertRadius = parseInt(mapDisplayAlertRadius.value);

   if(!req.body.location.latitude ||
      !req.body.location.longitude)
   {
     return res.status(200).send({ error: 'Missing params' });
   }

	 let userId = decodedTokenResult.user._id;
	 let location = [req.body.location.longitude, req.body.location.latitude];

	 // If admin let them filter on any user
	 if(decodedTokenResult.user.authorization.type === 'admin' &&
	 		req.body.userId &&
			req.body.location.longitude &&
			req.body.location.latitude)
	 {
		 userId = req.body.userId;

		 // Lookup user's last location to use
		 const filteredOnUser = await mUser.findOne({ _id: req.body.userId });
		 if(!filteredOnUser.lastLocation || filteredOnUser.lastLocation.coordinates.length < 2)
		 {
			 return res.status(200).send({ error: 'User does not have a last location set yet.' });
		 }
		 location = [filteredOnUser.lastLocation.coordinates[0], filteredOnUser.lastLocation.coordinates[1]];
	 }

	 // Save user's last location (only if this is not an admin from dashboard calling this API route)
	 if(!req.body.userId)
	 {
		 await mUser.updateById(userId,
		 {
			 lastLocation:
			 {
				 type: 'Point',
				 coordinates: location
			 }
		 });
	 }

	 // Get user's event subscriptions so we can filter out what events to display
	 const eventSubscriptions = await mEventSubscription.find({ createdBy: userId, isDeleted: false });
	 const types = eventSubscriptions.map( (subscription => {
		 return subscription.trigger.geofenceAreaType;
	 }));

   // Filter alerts more than 2 hours old
   var d = new Date();
   d.setHours(d.getHours() - 2);

   const geofenceAreas = await mGeofenceArea.find({
     location:
     {
       // Filter by alerts near us
       $near:
       {
         $maxDistance: mapDisplayAlertRadius,
         $geometry:
         {
           type: 'Point',
           coordinates: location
         }
       }
     },
     createdOn:
     {
       $gte: d
     },
		 type:
		 {
			 $in: types
		 }
   });

   // Success
   res.status(200).send({
		 results: geofenceAreas,
		 error: null,
		 token: decodedTokenResult.token
	 });
 }
 catch(err)
 {
   console.log(err);
   res.status(200).send({ error: err });
 }
});



module.exports = Router;
